'use strict';

const crypto = require('node:crypto');

// All state transitions use one Redis EVAL. Owner tokens fence late workers;
// the due index is an outbox so a failed QStash publish cannot strand accepted input.
const STORE_SCRIPT = String.raw`
local op = ARGV[1]
local p = cjson.decode(ARGV[2])
local now = tonumber(p.now)
local raw = redis.call('GET', KEYS[1])
local s = raw and cjson.decode(raw) or {sequence=0}
local function result(v) return cjson.encode(v) end
local function save()
  if not s.active and not s.pending then
    redis.call('DEL', KEYS[1])
    redis.call('ZREM', KEYS[2], p.chatHash)
  else
    redis.call('SET', KEYS[1], cjson.encode(s), 'PX', 600000)
    local due = s.active and s.active.dueAt or s.pending.dueAt
    redis.call('ZADD', KEYS[2], due, p.chatHash)
  end
end
local function terminal(status)
  redis.call('SET', KEYS[7], result({status=status}), 'EX', 86400)
  s.active = nil
  save()
  return result({status=status})
end
if op == 'append' then
  if p.messageHash ~= '' and redis.call('EXISTS', KEYS[3]) == 1 then
    return result({status='duplicate', batchId=s.pending and s.pending.id or (s.active and s.active.id), dueAt=s.pending and s.pending.dueAt or (s.active and s.active.dueAt)})
  end
  local count = tonumber(redis.call('GET', KEYS[4]) or '0')
  if count >= 30 then return result({status='spam_limited'}) end
  redis.call('INCR', KEYS[4]); redis.call('EXPIRE', KEYS[4], 60)
  if p.messageHash ~= '' then redis.call('SET', KEYS[3], '1', 'EX', 86400) end
  if not s.pending then s.pending={id=p.batchId, createdAt=now, dueAt=now+3000, fragments={}} end
  s.sequence = s.sequence + 1
  s.chatId = p.chatId
  table.insert(s.pending.fragments, {text=p.text, kind=p.kind, sequence=s.sequence})
  s.pending.dueAt = math.min(now+3000, s.pending.createdAt+8000)
  if redis.call('EXISTS', KEYS[6]) == 1 then redis.call('EXPIRE', KEYS[6], 300) end
  save()
  return result({status='accepted', batchId=s.pending.id, dueAt=s.pending.dueAt})
end
if op == 'claim' then
  if redis.call('EXISTS', KEYS[7]) == 1 then return redis.call('GET', KEYS[7]) end
  if s.active and s.active.id ~= p.batchId then
    if s.pending and s.pending.id == p.batchId then return result({status='blocked', dueAt=s.active.dueAt}) end
    return result({status='ignored'})
  end
  if not s.active then
    if not s.pending or s.pending.id ~= p.batchId then return result({status='ignored'}) end
    if now < s.pending.dueAt then return result({status='deferred', dueAt=s.pending.dueAt}) end
    s.active=s.pending; s.pending=nil
    s.active.attempts=0; s.active.nextChunk=1
  end
  local a=s.active
  if now-a.createdAt >= 600000 then return terminal('expired') end
  if a.owner and a.leaseUntil > now then return result({status='busy', dueAt=a.leaseUntil}) end
  -- A worker may die after Zalo accepted a chunk but before Redis recorded it.
  if a.inFlight then return terminal('delivery_unknown') end
  if a.attempts >= 4 then return terminal('failed') end
  if now < a.dueAt then return result({status='deferred', dueAt=a.dueAt}) end
  if not a.quotaReserved then
    local daily = tonumber(redis.call('GET', KEYS[5]) or '0')
    a.quotaAllowed = daily < tonumber(p.dailyLimit)
    if a.quotaAllowed then redis.call('INCR', KEYS[5]); redis.call('EXPIRE', KEYS[5], p.dayTtl) end
    a.quotaReserved=true
  end
  a.attempts=a.attempts+1; a.owner=p.owner; a.leaseUntil=now+65000; a.dueAt=a.leaseUntil
  save()
  local historyRaw=redis.call('GET', KEYS[6])
  return result({status='claimed', batch=a, chatId=s.chatId, history=historyRaw and cjson.decode(historyRaw) or {}})
end
local a=s.active
if not a or a.id ~= p.batchId or a.owner ~= p.owner or a.leaseUntil <= now then return result({status='stale'}) end
if op == 'reply' then
  a.reply=p.reply
elseif op == 'sending' then
  if tonumber(p.index) ~= a.nextChunk then return result({status='stale'}) end
  a.inFlight=p.index
elseif op == 'sent' then
  if a.inFlight ~= p.index then return result({status='stale'}) end
  a.inFlight=nil; a.nextChunk=p.index+1
elseif op == 'retry' then
  a.inFlight=nil
  if a.attempts >= 4 then return terminal('failed') end
  a.owner=nil; a.dueAt=now+10000*2^(a.attempts-1)
elseif op == 'finish' then
  if p.history and #p.history > 0 and p.status == 'done' then redis.call('SET', KEYS[6], cjson.encode(p.history), 'EX', 300) end
  return terminal(p.status)
else return redis.error_reply('INVALID_ZALO_OPERATION') end
save()
return result({status='saved'})
`;

const DUE_SCRIPT = String.raw`
local members=redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, 50)
local jobs={}
local expired=0
for _, chatHash in ipairs(members) do
  local raw=redis.call('GET', ARGV[2]..':chat:'..chatHash)
  if raw then
    local s=cjson.decode(raw)
    local a=s.active or s.pending
    if a then table.insert(jobs, {chatHash=chatHash, batchId=a.id, dueAt=a.dueAt}) else redis.call('ZREM', KEYS[1], chatHash) end
  else
    redis.call('ZREM', KEYS[1], chatHash)
    expired=expired+1
  end
end
return cjson.encode({jobs=jobs, expired=expired})
`;

function storeNamespace(env = process.env) {
    const environment = ['production', 'preview'].includes(env.VERCEL_ENV) ? env.VERCEL_ENV : 'development';
    // Shared Preview resources must not mix independent deployments or production data.
    const deployment = environment === 'preview' ? String(env.VERCEL_URL || 'local-preview') : environment;
    const suffix = crypto.createHash('sha256').update(deployment).digest('hex').slice(0, 16);
    return `bandocapt:zalo:v1:${environment}:${suffix}`;
}

function hashPrincipal(value, env = process.env) {
    if (!env.CHAT_LOG_HASH_SALT?.trim()) throw new Error('ZALO_STORE_UNCONFIGURED');
    return crypto.createHmac('sha256', env.CHAT_LOG_HASH_SALT).update(String(value)).digest('hex');
}

function dayWindow(now) {
    const day = Math.floor((now + 7 * 3600000) / 86400000);
    return { key: String(day), ttl: Math.ceil(((day + 1) * 86400000 - 7 * 3600000 - now) / 1000) };
}

function createZaloBatchStore({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
    const namespace = storeNamespace(env);
    const command = async (args, deadlineAt) => {
        if (!env.KV_REST_API_URL || !env.KV_REST_API_TOKEN || !env.CHAT_LOG_HASH_SALT?.trim()) throw new Error('ZALO_STORE_UNCONFIGURED');
        const timeoutMs = Math.min(4000, deadlineAt === undefined ? 4000 : deadlineAt - now());
        if (timeoutMs <= 0) throw new Error('ZALO_STORE_FAILED');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetchImpl(env.KV_REST_API_URL.replace(/\/+$/, ''), {
                method: 'POST', signal: controller.signal,
                headers: { Authorization: `Bearer ${env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(args),
            });
            if (!response.ok) throw new Error('ZALO_STORE_FAILED');
            const payload = await response.json();
            if (payload.error || typeof payload.result !== 'string') throw new Error('ZALO_STORE_FAILED');
            return JSON.parse(payload.result);
        } catch (_) { throw new Error('ZALO_STORE_FAILED'); }
        finally { clearTimeout(timer); }
    };
    const transition = (op, data) => {
        if (!/^[a-f0-9]{64}$/.test(data.chatHash) || !/^[a-f0-9-]{36}$/.test(data.batchId)) throw new Error('INVALID_ZALO_JOB');
        const time = now();
        const day = dayWindow(time);
        const keys = [
            `${namespace}:chat:${data.chatHash}`, `${namespace}:due`,
            `${namespace}:dedupe:${data.chatHash}:${data.messageHash || 'none'}`,
            `${namespace}:minute:${data.chatHash}:${Math.floor(time / 60000)}`,
            `${namespace}:daily:${day.key}:${data.chatHash}`, `${namespace}:session:${data.chatHash}`,
            `${namespace}:done:${data.batchId}`,
        ];
        const limit = Number.parseInt(env.CHAT_DAILY_IP_LIMIT, 10);
        return command(['EVAL', STORE_SCRIPT, String(keys.length), ...keys, op,
            JSON.stringify({ ...data, now: time, dailyLimit: limit > 0 ? limit : 50, dayTtl: day.ttl })], data.deadlineAt);
    };
    return {
        namespace,
        append: data => transition('append', { batchId: crypto.randomUUID(), ...data }),
        claim: data => transition('claim', { owner: crypto.randomUUID(), ...data }),
        saveReply: data => transition('reply', data),
        markSending: data => transition('sending', data),
        markSent: data => transition('sent', data),
        retry: data => transition('retry', data),
        finish: data => transition('finish', data),
        dueJobs: () => command(['EVAL', DUE_SCRIPT, '1', `${namespace}:due`, String(now()), namespace]),
    };
}

module.exports = { STORE_SCRIPT, DUE_SCRIPT, storeNamespace, hashPrincipal, dayWindow, createZaloBatchStore };
