'use strict';

const {
    normalizeLabel,
    normalizePublishedLocations,
    validatePublishedLocationsSchema,
} = require('../js/location-data');
const { resolvePublicLocationWorkbook } = require('./location-workbooks');
const { buildRequestPlan } = require('./chat-intent');

const PUBLISHED_SHEET = 'Published_Locations';
const GOOGLE_TIMEOUT_MS = 8000;
const LOCATION_CACHE_TTL_MS = 60 * 1000;
const LOCATION_CACHE_STALE_MAX_MS = 5 * 60 * 1000;
const DUPLICATE_COORDINATE_PRECISION = 6;
const ASSISTANT_LOCATION_FOLLOWUP_PATTERNS = [
    /ban o xa\/phuong nao/i,
    /ban o xa nao/i,
    /ban o phuong nao/i,
    /ban dang o xa\/phuong nao/i,
    /de minh chi dung tru so cong an/i,
    /de minh chi dung cong an/i,
];
// Bot hỏi quốc tịch (luồng mất hộ chiếu) — phrasing vi/en cố định trong prompt, cả 2 thứ tự.
const ASSISTANT_NATIONALITY_FOLLOWUP_PATTERNS = [
    /cong dan viet nam hay (?:la )?nguoi nuoc ngoai/i,
    /nguoi nuoc ngoai hay (?:la )?cong dan viet nam/i,
    /foreign national or a vietnamese citizen/i,
    /vietnamese citizen or a foreign national/i,
    /ban mang quoc tich nao/i,
];
const LOCATION_TRIGGER_PATTERNS = [
    /\b(cong an|tru so|dia chi|o dau|so dien thoai|google maps|chi duong|can cuoc|cccd)\b/i,
    /\b(xa|phuong|thi tran|thi xa)\b/i,
    /\b(police station|commune police|ward police|where.*(declare|submit|go|register)|directions|address|phone number)\b/i,
    /\b(?:don vi|co quan|tru so|diem|dia diem|noi)\s+nao\b/i,
];
const RESIDENCE_DECLARATION_PATTERNS = [
    /\b(toi|em|minh|chung toi|gia dinh toi)\s+(dang\s+)?o\b/i,
    /\b(cu tru|tam tru|thuong tru)\s+tai\b/i,
    /\bnoi o\b/i,
];
const ADMIN_PREFIX_PATTERN = /^(xa|phuong|thi tran|thi xa)\s+/;
// Tên tỉnh/khu vực trùng với bareName đơn vị (vd "Công an Phường Phú Thọ" → bareName "phu tho").
// Người dùng nhắc các tên này như NGỮ CẢNH VÙNG, không phải tên đơn vị → cấm match qua bare/approved trần.
// Vẫn match được khi nói rõ "phường/xã <tên>" (qua fullName/withoutCongAn).
const REGION_STOPWORDS = new Set(['phu tho', 'tinh phu tho', 'viet tri', 'vinh phuc', 'hoa binh']);
const MAX_SHORT_LOCATION_TOKENS = 4;
const SHORT_MESSAGE_NON_LOCATION_PATTERN = /\b(cccd|can cuoc|ho chieu|thu tuc|le phi|bao lau|bao nhieu|lam the nao|dang ky|dang ki|tam tru|thuong tru|ly lich)\b/i;
// Câu trả lời quốc tịch ("Người Việt Nam", "Công dân Việt Nam", "Người nước ngoài",
// "Vietnamese citizen", "Foreigner") là follow-up của luồng thủ tục, KHÔNG phải địa danh.
const NATIONALITY_ANSWER_PATTERN = /\b(?:nguoi|cong dan|quoc tich)\s+(?:viet nam|nuoc ngoai)\b|\bvietnamese\b|\bforeigner\b|\bforeign national\b/i;

let locationCache = null;

function parseGoogleVisualizationPayload(text) {
    const match = String(text || '').match(/google\.visualization\.Query\.setResponse\((.+)\);?\s*$/s);
    if (!match?.[1]) throw new Error('INVALID_GOOGLE_RESPONSE');

    const payload = JSON.parse(match[1]);
    if (!payload?.table || !Array.isArray(payload.table.cols) || !Array.isArray(payload.table.rows)) {
        throw new Error('INVALID_SHEET_SCHEMA');
    }
    return payload;
}

async function fetchGoogleVisualizationPayload(options = {}) {
    const sheetId = options.sheetId || resolvePublicLocationWorkbook(options.env || process.env).spreadsheetId;

    const fetchImpl = options.fetchImpl || fetch;
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || GOOGLE_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        // GViz auto-detects multiple header rows when the first data row is mostly text.
        // The public schema has exactly one header row; make that contract explicit so the
        // first Published_Locations record is not folded into column labels.
        const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent(PUBLISHED_SHEET)}`;
        const response = await fetchImpl(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`GOOGLE_HTTP_${response.status}`);
        return parseGoogleVisualizationPayload(await response.text());
    } finally {
        clearTimeout(timeout);
    }
}

function buildRecordSignature(record) {
    const lat = Number(record.lat);
    const lng = Number(record.lng);
    return [
        normalizeLabel(record.address),
        normalizeLabel(record.phone),
        Number.isFinite(lat) ? lat.toFixed(DUPLICATE_COORDINATE_PRECISION) : '',
        Number.isFinite(lng) ? lng.toFixed(DUPLICATE_COORDINATE_PRECISION) : '',
    ].join('|');
}

const STRUCTURED_ADMIN_LOCATION_PATTERN = /\b(?:cong an\s+)?(?:xa|phuong|thi tran|thi xa|huyen|thanh pho|tinh)\s+(?!nao\b|gi\b|sao\b|dau\b|o dau\b|phu hop\b|gan nhat\b)[a-z0-9à-ỹ]+/i;
const STRUCTURED_ADDRESS_LOCATION_PATTERN = /\b(?:duong|pho|thon|xom)\s+(?!nao\b|gi\b|sao\b|dau\b|thong\b|bien\b|quat\b)[a-z0-9à-ỹ]+|\b(?:to|ap)\s+[0-9]+|\bkhu\s+(?:pho|do\s+thi)\s+[a-z0-9à-ỹ]+|\bban\s+(?!sao\b|chinh\b|do\b|hanh\b|giao\b|khai\b|ve\b)[a-z0-9à-ỹ]+/i;
const ENGLISH_LOCATION_PATTERN = /\b(?:police station\s+(?:for|in|at|of)|ward\s+police|commune\s+police|ward|commune)\s+[a-z0-9]+/i;
const PREPOSITION_QUESTION_PATTERN = /^(?:dau\b|cho nao\b|noi nao\b|dia diem nao\b|dia ban nao\b|khu vuc nao\b|dia chi nao\b|cong an nao\b|don vi nao\b|co quan nao\b|tru so nao\b|diem nao\b|bo phan nao\b|xa nao\b|phuong nao\b|thi tran nao\b|huyen nao\b|tinh nao\b|nao\b|gi\b|sao\b|lam sao\b|the nao\b|may gio\b|bao lau\b|lam\b|nop\b)/i;

function stripCongAnPrefix(value) {
    return String(value || '').replace(/^cong an\s+/, '').trim();
}

function stripAdministrativePrefix(value) {
    const str = String(value || '').trim();
    if (/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(str)) {
        return str.replace(/^(?:xã|phường|thị trấn|thị xã)\s+/i, '').trim();
    }
    const match = str.match(ADMIN_PREFIX_PATTERN);
    if (match) {
        const remainder = str.slice(match[0].length).trim();
        const remainderWords = remainder.split(/\s+/).filter(Boolean);
        if (remainderWords.length >= 2) {
            return remainder;
        }
    }
    return str;
}

function createAliasVariants(value) {
    const normalized = normalizeLabel(value);
    const withoutCongAn = stripCongAnPrefix(normalized);
    const withoutAdmin = stripAdministrativePrefix(withoutCongAn);
    return Array.from(new Set([normalized, withoutCongAn, withoutAdmin].filter(Boolean)));
}

function parseSearchAliases(value) {
    return String(value || '')
        .split('|')
        .map(item => item.trim())
        .filter(Boolean);
}

function buildLocationAliases(location) {
    const generated = createAliasVariants(location.name);
    const approved = [...parseSearchAliases(location.searchAliases), ...parseSearchAliases(location.servedUnits)]
        .flatMap(alias => createAliasVariants(alias));
    const fullName = generated[0] || '';
    const withoutCongAn = generated[1] || '';
    const bareName = generated[2] || '';
    const approvedAliases = Array.from(new Set(
        approved.filter(alias => alias && alias !== fullName && alias !== withoutCongAn && alias !== bareName && !REGION_STOPWORDS.has(alias))
    ));

    return {
        fullName,
        withoutCongAn,
        bareName,
        approved: approvedAliases,
        all: Array.from(new Set([fullName, withoutCongAn, bareName, ...approvedAliases].filter(Boolean))),
    };
}

function mergeAliasState(baseAliases, nextAliases) {
    const fullName = baseAliases?.fullName || nextAliases.fullName || '';
    const withoutCongAn = baseAliases?.withoutCongAn || nextAliases.withoutCongAn || '';
    const bareName = baseAliases?.bareName || nextAliases.bareName || '';
    const approved = Array.from(new Set([...(baseAliases?.approved || []), ...(nextAliases.approved || [])]));
    return {
        fullName,
        withoutCongAn,
        bareName,
        approved,
        all: Array.from(new Set([fullName, withoutCongAn, bareName, ...approved].filter(Boolean))),
    };
}

function looksLikeResidenceDeclaration(text) {
    const normalized = normalizeLabel(text);
    return RESIDENCE_DECLARATION_PATTERNS.some(pattern => pattern.test(normalized));
}

function looksLikeShortLocationText(text) {
    const normalized = normalizeLabel(text);
    if (!normalized || SHORT_MESSAGE_NON_LOCATION_PATTERN.test(normalized)) return false;
    if (NATIONALITY_ANSWER_PATTERN.test(normalized)) return false;
    if (!/[a-z]/i.test(normalized)) return false;
    const words = normalized.split(' ').filter(Boolean);
    return words.length > 0 && words.length <= MAX_SHORT_LOCATION_TOKENS;
}

function isBarePlaceNameQuery(currentMessage) {
    const normalized = normalizeLabel(currentMessage);
    return looksLikeShortLocationText(currentMessage) &&
        !LOCATION_TRIGGER_PATTERNS.some(pattern => pattern.test(normalized)) &&
        !looksLikeResidenceDeclaration(currentMessage);
}

function dedupePublishedLocations(locations) {
    const groups = new Map();

    for (const location of locations) {
        const normalizedName = normalizeLabel(location.name);
        const signature = buildRecordSignature(location);
        const existing = groups.get(normalizedName) || {
            normalizedName,
            name: location.name,
            recordsBySignature: new Map(),
        };
        if (!existing.recordsBySignature.has(signature)) {
            existing.recordsBySignature.set(signature, {
                ...location,
                normalizedName,
                aliases: buildLocationAliases(location),
            });
        } else {
            const currentRecord = existing.recordsBySignature.get(signature);
            currentRecord.aliases = mergeAliasState(currentRecord.aliases, buildLocationAliases(location));
            currentRecord.searchAliases = Array.from(new Set(
                [...parseSearchAliases(currentRecord.searchAliases), ...parseSearchAliases(location.searchAliases)]
            )).join('|');
            currentRecord.services = Array.from(new Set([...(currentRecord.services || []), ...(location.services || [])]));
            currentRecord.servedUnits = Array.from(new Set([
                ...parseSearchAliases(currentRecord.servedUnits), ...parseSearchAliases(location.servedUnits)
            ])).join('|');
        }
        groups.set(normalizedName, existing);
    }

    const uniqueLocations = [];
    const conflicts = [];
    for (const group of groups.values()) {
        const records = Array.from(group.recordsBySignature.values());
        if (records.length === 1) {
            uniqueLocations.push(records[0]);
            continue;
        }
        conflicts.push({
            normalizedName: group.normalizedName,
            name: group.name,
            records,
        });
    }

    return { uniqueLocations, conflicts };
}

function getGoogleMapsUrl(location) {
    const lat = Number(location?.lat);
    const lng = Number(location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

async function getPublishedLocations(options = {}) {
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const forceRefresh = options.forceRefresh === true;
    const allowStale = options.allowStale !== false;
    if (!forceRefresh && locationCache && now - locationCache.fetchedAt <= LOCATION_CACHE_TTL_MS) {
        return { ...locationCache, cacheStatus: 'fresh' };
    }

    try {
        const payload = await fetchGoogleVisualizationPayload(options);
        const schema = validatePublishedLocationsSchema(payload?.table);
        if (!schema.ok) throw new Error('GOOGLE_SHEET_SCHEMA_MISMATCH');
        const normalized = normalizePublishedLocations(payload);
        if (payload.table.rows.length > 0 && normalized.locations.length === 0) {
            throw new Error('PUBLISHED_LOCATIONS_DATASET_INVALID');
        }
        const deduped = dedupePublishedLocations(normalized.locations);
        locationCache = {
            payload,
            fetchedAt: now,
            locations: deduped.uniqueLocations.map(location => ({
                ...location,
                // Keep the workbook value alongside the assistant-facing derived link. Staff
                // mutation snapshots must preserve an explicit blank Maps field as a no-op.
                sourceGoogleMapsUrl: location.googleMapsUrl,
                googleMapsUrl: getGoogleMapsUrl(location),
            })),
            rejected: normalized.rejected,
            conflicts: deduped.conflicts.map(conflict => ({
                ...conflict,
                records: conflict.records.map(location => ({
                    ...location,
                    sourceGoogleMapsUrl: location.googleMapsUrl,
                    googleMapsUrl: getGoogleMapsUrl(location),
                })),
            })),
        };
        return { ...locationCache, cacheStatus: 'fresh' };
    } catch (error) {
        if (allowStale && locationCache && now - locationCache.fetchedAt <= LOCATION_CACHE_STALE_MAX_MS) {
            return { ...locationCache, cacheStatus: 'stale', staleReason: error.message || 'UNKNOWN_ERROR' };
        }
        throw error;
    }
}

function getImmediateLocationFollowupContext(history) {
    const items = Array.isArray(history) ? history : [];
    const assistantTurn = items[items.length - 1];
    if (assistantTurn?.role !== 'model') return { isImmediate: false, previousUserText: '' };

    const normalized = normalizeLabel(assistantTurn.parts?.map(part => String(part?.text || '')).join(' '));
    const isImmediate = ASSISTANT_LOCATION_FOLLOWUP_PATTERNS.some(pattern => pattern.test(normalized));
    if (!isImmediate) return { isImmediate: false, previousUserText: '' };

    const previousUserTurn = items[items.length - 2];
    if (previousUserTurn?.role !== 'user') return { isImmediate: true, previousUserText: '' };
    return {
        isImmediate: true,
        previousUserText: previousUserTurn.parts?.map(part => String(part?.text || '')).join(' ').trim() || '',
    };
}

function wasAssistantAskingForLocation(history) {
    return getImmediateLocationFollowupContext(history).isImmediate;
}

function wasAssistantAskingForNationality(history) {
    const items = Array.isArray(history) ? history : [];
    const assistantTurn = items[items.length - 1];
    if (assistantTurn?.role !== 'model') return false;
    const normalized = normalizeLabel(assistantTurn.parts?.map(part => String(part?.text || '')).join(' '));
    return ASSISTANT_NATIONALITY_FOLLOWUP_PATTERNS.some(pattern => pattern.test(normalized));
}

// Câu hiện tại là trả lời quốc tịch, hoặc là câu ngắn ngay sau khi bot hỏi quốc tịch mà không
// mang tín hiệu địa điểm — api/chat dùng để không rơi vào nhánh trả lời tất định no_match.
function isNationalityAnswerContext(currentMessage, history) {
    const normalized = normalizeLabel(currentMessage);
    if (NATIONALITY_ANSWER_PATTERN.test(normalized)) return true;
    return wasAssistantAskingForNationality(history) &&
        !LOCATION_TRIGGER_PATTERNS.some(pattern => pattern.test(normalized)) &&
        !looksLikeResidenceDeclaration(currentMessage);
}

function resolveLocationCandidateFromDataset(message, dataset) {
    if (!dataset || !Array.isArray(dataset.locations) || dataset.locations.length === 0) {
        return null;
    }
    const normalized = normalizeLabel(message);
    if (!normalized) return null;

    const prepRegex = /\b(?:cu tru tai|tam tru tai|thuong tru tai|noi o(?: tai)?|(?:toi|em|minh|chung toi|gia dinh toi)(?:\s+dang)?\s+o|khu vuc|dia ban|tai|o|in|at|for)\s+/g;
    let match;

    while ((match = prepRegex.exec(normalized)) !== null) {
        const remainder = normalized.slice(match.index + match[0].length).trim();
        if (!remainder) continue;

        if (PREPOSITION_QUESTION_PATTERN.test(remainder)) {
            continue;
        }

        for (const loc of dataset.locations) {
            const bareName = loc.aliases?.bareName || '';
            const approved = loc.aliases?.approved || [];
            const withoutCongAn = loc.aliases?.withoutCongAn || '';
            const fullName = loc.aliases?.fullName || '';

            const candidates = [
                fullName,
                withoutCongAn,
                bareName,
                ...approved,
            ].filter(Boolean);

            for (const candidate of candidates) {
                const tokens = candidate.split(/\s+/).filter(Boolean);
                // Invariant: Preposition evidence requires a multi-token alias (>= 2 tokens).
                // Single-token aliases (e.g. "bo", "lam", "an") are strictly forbidden as preposition evidence.
                if (tokens.length < 2) continue;

                if (aliasAppearsInText(candidate, remainder)) {
                    const candidateIndex = remainder.indexOf(candidate);
                    const wordsBeforeCandidate = remainder.slice(0, candidateIndex).trim().split(/\s+/).filter(Boolean);
                    if (wordsBeforeCandidate.length <= 2) {
                        return { matchedAlias: candidate, location: loc };
                    }
                }
            }
        }
    }

    return null;
}

function extractLocationEvidence(currentMessage, history = [], dataset = null) {
    const raw = String(currentMessage || '').trim();
    const normalized = normalizeLabel(raw);
    if (!normalized) {
        return { hasLocationEvidence: false, source: 'none', text: '' };
    }

    if (NATIONALITY_ANSWER_PATTERN.test(normalized)) {
        return { hasLocationEvidence: false, source: 'nationality_answer', text: '' };
    }

    if (wasAssistantAskingForLocation(history) && looksLikeShortLocationText(raw)) {
        return { hasLocationEvidence: true, source: 'assistant_location_followup', text: raw };
    }

    if (STRUCTURED_ADMIN_LOCATION_PATTERN.test(raw) || STRUCTURED_ADMIN_LOCATION_PATTERN.test(normalized) ||
        STRUCTURED_ADDRESS_LOCATION_PATTERN.test(raw) || STRUCTURED_ADDRESS_LOCATION_PATTERN.test(normalized) ||
        ENGLISH_LOCATION_PATTERN.test(raw) || ENGLISH_LOCATION_PATTERN.test(normalized)) {
        return { hasLocationEvidence: true, source: 'structured_admin_unit', text: raw };
    }

    const datasetToUse = dataset || locationCache;
    const candidateMatch = resolveLocationCandidateFromDataset(raw, datasetToUse);
    if (candidateMatch) {
        return { hasLocationEvidence: true, source: 'preposition_location', text: raw, matchedAlias: candidateMatch.matchedAlias };
    }

    if (isBarePlaceNameQuery(raw)) {
        return { hasLocationEvidence: true, source: 'bare_place_name', text: raw };
    }

    return { hasLocationEvidence: false, source: 'none', text: '' };
}

function hasLocationEvidence(currentMessage, history = [], dataset = null) {
    return extractLocationEvidence(currentMessage, history, dataset).hasLocationEvidence;
}

function isLocationLookupRequested(currentMessage, history) {
    return buildRequestPlan(currentMessage, history).locationTask !== 'none';
}

function buildLookupTexts(currentMessage, history, hasEvidence) {
    const isImmediateFollowup = wasAssistantAskingForLocation(history) && looksLikeShortLocationText(currentMessage);
    const texts = [];
    const add = (text, source, allowBareName, allowApprovedAlias = false, allowRegionStopwords = false, allowSingleTokenAlias = false) => {
        const normalized = normalizeLabel(text);
        if (!normalized) return;
        if (!texts.some(item =>
            item.normalized === normalized &&
            item.allowBareName === allowBareName &&
            item.allowApprovedAlias === allowApprovedAlias &&
            item.allowRegionStopwords === allowRegionStopwords &&
            item.allowSingleTokenAlias === allowSingleTokenAlias
        )) {
            texts.push({ normalized, source, allowBareName, allowApprovedAlias, allowRegionStopwords, allowSingleTokenAlias });
        }
    };

    const evidenceResolved = hasEvidence !== undefined ? Boolean(hasEvidence) : hasLocationEvidence(currentMessage, history);

    add(currentMessage, 'current', false, false, false, false);
    if (evidenceResolved) {
        add(
            currentMessage,
            'current-loose',
            true,
            true,
            wasAssistantAskingForLocation(history),
            isImmediateFollowup
        );
    }

    return texts;
}

function aliasAppearsInText(alias, normalizedText) {
    if (!alias || !normalizedText) return false;
    const cleanText = normalizedText.replace(/[.,!?;:'"()[\]{}]/g, ' ').replace(/\s+/g, ' ');
    const boundaryPattern = new RegExp(`(^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|\\s)`, 'i');
    return boundaryPattern.test(cleanText);
}

function scoreLocationMatch(location, lookupTexts) {
    let bestScore = -1;
    let matchedAlias = '';

    for (const lookupText of lookupTexts) {
        const fullAlias = location.aliases?.fullName || '';
        const withoutCongAn = location.aliases?.withoutCongAn || '';
        const bareName = location.aliases?.bareName || '';
        const approvedAliases = location.aliases?.approved || [];

        if (aliasAppearsInText(fullAlias, lookupText.normalized)) {
            const score = lookupText.source === 'current' ? 120 : 110;
            if (score > bestScore) {
                bestScore = score;
                matchedAlias = fullAlias;
            }
        }
        if (withoutCongAn && aliasAppearsInText(withoutCongAn, lookupText.normalized)) {
            const score = lookupText.source === 'current' ? 100 : 90;
            if (score > bestScore) {
                bestScore = score;
                matchedAlias = withoutCongAn;
            }
        }
        if (lookupText.allowBareName && bareName &&
            (lookupText.allowRegionStopwords || !REGION_STOPWORDS.has(bareName))) {
            const bareTokens = bareName.split(/\s+/).filter(Boolean);
            if (bareTokens.length >= 2 || lookupText.allowSingleTokenAlias) {
                if (aliasAppearsInText(bareName, lookupText.normalized)) {
                    const score = lookupText.source === 'current-loose' ? 80 : 70;
                    if (score > bestScore) {
                        bestScore = score;
                        matchedAlias = bareName;
                    }
                }
            }
        }
        if (lookupText.allowApprovedAlias) {
            for (const alias of approvedAliases) {
                const aliasTokens = alias.split(/\s+/).filter(Boolean);
                // Invariant: Single-token aliases (e.g. "bo", "lam", "an") are strictly forbidden
                // from matching in procedural sentences. They may only match in immediate short location follow-ups.
                if (aliasTokens.length < 2 && !lookupText.allowSingleTokenAlias) {
                    continue;
                }
                if (!aliasAppearsInText(alias, lookupText.normalized)) continue;
                const score = lookupText.source === 'current-loose' ? 60 : 50;
                if (score > bestScore) {
                    bestScore = score;
                    matchedAlias = alias;
                }
            }
        }
    }

    if (bestScore < 0) return null;
    return { score: bestScore, matchedAlias };
}

function asksForCitizenIdLocation(message, history) {
    if (/\b(can cuoc|cccd)\b/.test(normalizeLabel(message))) return true;
    const immediate = getImmediateLocationFollowupContext(history);
    return immediate.isImmediate && /\b(can cuoc|cccd)\b/.test(normalizeLabel(immediate.previousUserText));
}

function servicePriority(location, wantsCitizenId) {
    if (!wantsCitizenId || !(location.services || []).includes('CITIZEN_ID')) return 0;
    return location.cccdServiceMode === 'TEMPORARILY_PAUSED' ? 1 : 2;
}

function findVerifiedLocationMatches(currentMessage, history, dataset) {
    const lookupRequested = isLocationLookupRequested(currentMessage, history);
    if (!lookupRequested) {
        return {
            lookupRequested: false,
            hasLocationEvidence: false,
            evidenceSource: 'none',
            locationEvidenceSource: 'none',
            status: 'not_requested',
            matches: []
        };
    }

    const evidence = extractLocationEvidence(currentMessage, history, dataset);
    if (!evidence.hasLocationEvidence) {
        return {
            lookupRequested: true,
            hasLocationEvidence: false,
            evidenceSource: evidence.source || 'none',
            locationEvidenceSource: evidence.source || 'none',
            status: 'missing_location_evidence',
            matches: [],
            lookupTexts: buildLookupTexts(currentMessage, history, false),
        };
    }

    const lookupTexts = buildLookupTexts(currentMessage, history, true);
    const matchedLocations = [];
    const wantsCitizenId = asksForCitizenIdLocation(currentMessage, history);
    for (const location of dataset.locations || []) {
        const match = scoreLocationMatch(location, lookupTexts);
        if (match) {
            const priority = servicePriority(location, wantsCitizenId);
            matchedLocations.push({ ...location, matchScore: match.score + priority * 50, servicePriority: priority, matchedAlias: match.matchedAlias });
        }
    }

    const matchedConflicts = [];
    for (const conflict of dataset.conflicts || []) {
        const score = conflict.records
            .map(location => scoreLocationMatch(location, lookupTexts))
            .filter(Boolean)
            .sort((a, b) => b.score - a.score)[0];
        if (score) {
            matchedConflicts.push({
                ...conflict,
                matchScore: score.score,
                matchedAlias: score.matchedAlias,
                records: conflict.records.map(location => ({
                    ...location,
                    googleMapsUrl: location.googleMapsUrl || getGoogleMapsUrl(location),
                })),
            });
        }
    }

    matchedLocations.sort((a, b) => b.matchScore - a.matchScore || b.servicePriority - a.servicePriority || a.name.localeCompare(b.name, 'vi'));
    matchedConflicts.sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name, 'vi'));

    if (matchedConflicts.length > 0) {
        return {
            lookupRequested: true,
            hasLocationEvidence: true,
            evidenceSource: evidence.source,
            locationEvidenceSource: evidence.source,
            status: 'ambiguous_conflict',
            matches: [],
            conflicts: matchedConflicts,
            lookupTexts,
        };
    }
    if (matchedLocations.length === 0) {
        return {
            lookupRequested: true,
            hasLocationEvidence: true,
            evidenceSource: evidence.source,
            locationEvidenceSource: evidence.source,
            status: 'no_match',
            matches: [],
            lookupTexts,
        };
    }

    const bestScore = matchedLocations[0].matchScore;
    const topMatches = matchedLocations.filter(location => location.matchScore === bestScore && location.servicePriority === matchedLocations[0].servicePriority);
    if (topMatches.length > 1) {
        return {
            lookupRequested: true,
            hasLocationEvidence: true,
            evidenceSource: evidence.source,
            locationEvidenceSource: evidence.source,
            status: 'ambiguous_match',
            matches: topMatches,
            lookupTexts,
        };
    }

    return {
        lookupRequested: true,
        hasLocationEvidence: true,
        evidenceSource: evidence.source,
        locationEvidenceSource: evidence.source,
        status: 'matched',
        matches: [matchedLocations[0]],
        lookupTexts,
    };
}

function formatVerifiedLocationsPrompt(result, dataset) {
    const cacheStatus = dataset?.cacheStatus || 'fresh';
    if (!result?.lookupRequested) {
        return `STATUS: not_requested\nCACHE_STATUS: ${cacheStatus}`;
    }

    if (result.status === 'missing_place' || result.status === 'missing_location_evidence' || result.hasLocationEvidence === false) {
        return `STATUS: missing_place\nCACHE_STATUS: ${cacheStatus}\nNOTE: Nguoi dung can tim dia diem lam thu tuc nhung CHUA cung cap xa/phuong hoac dia ban. Tuyet doi KHONG tu y chon, KHONG neu ten bat ky tru so Cong an xa/phuong cu the nao, khong neu dia chi, SDT, toa do hay Google Maps. Hay giai thich tham quyen chung (neu co) va yeu cau nguoi dung cho biet xa/phuong dang o de chi dung dia diem.`;
    }

    if (result.status === 'unavailable') {
        return `STATUS: unavailable\nCACHE_STATUS: unavailable\nNOTE: Du lieu tru so tam thoi khong kha dung. Van co the tra loi phan thu tuc, nhung phai noi ro khong the xac minh dia chi tru so luc nay.`;
    }

    if (result.status === 'no_match') {
        return `STATUS: no_match\nCACHE_STATUS: ${cacheStatus}\nNOTE: Chua tim thay tru so duoc xac minh khop voi thong tin nguoi dung vua cung cap.`;
    }

    if (result.status === 'ambiguous_conflict') {
        const lines = result.conflicts.flatMap((conflict, index) => {
            return [
                `CONFLICT ${index + 1}: ${conflict.name}`,
                ...conflict.records.map((record, recordIndex) => `${index + 1}.${recordIndex + 1} | TEN=${record.name} | DIA_CHI=${record.address || 'Chua co'} | SDT=${record.phone || 'Chua co'} | TOA_DO=${record.lat},${record.lng} | GOOGLE_MAPS=${record.googleMapsUrl || 'Chua co'}`),
            ];
        });
        return `STATUS: ambiguous_conflict\nCACHE_STATUS: ${cacheStatus}\nNOTE: Co nhieu ban ghi cung ten nhung du lieu mau thuan. Khong duoc tu chon. Yeu cau nguoi dung xac nhan them.\n${lines.join('\n')}`;
    }

    if (result.status === 'ambiguous_match') {
        const lines = result.matches.map((record, index) =>
            `OPTION ${index + 1} | TEN=${record.name} | MATCHED_ALIAS=${record.matchedAlias || ''} | DIA_CHI=${record.address || 'Chua co'} | SDT=${record.phone || 'Chua co'} | TOA_DO=${record.lat},${record.lng} | GOOGLE_MAPS=${record.googleMapsUrl || 'Chua co'}`
        );
        return `STATUS: ambiguous_match\nCACHE_STATUS: ${cacheStatus}\nNOTE: Co nhieu tru so khop cung muc uu tien. Yeu cau nguoi dung noi ro xa/phuong, khong duoc tu chon.\n${lines.join('\n')}`;
    }

    const record = result.matches[0];
    return [
        `STATUS: matched`,
        `CACHE_STATUS: ${cacheStatus}`,
        `TEN_HIEN_HANH=${record.name}`,
        `DIA_CHI=${record.address || 'Chua co'}`,
        `SDT=${record.phone || 'Chua co'}`,
        `TOA_DO=${record.lat},${record.lng}`,
        `GOOGLE_MAPS=${record.googleMapsUrl || 'Chua co'}`,
        `DICH_VU=${(record.services || []).join('|') || 'Chua co'}`,
        `CCCD_MODE=${record.cccdServiceMode || 'UNKNOWN'}`,
        `DIA_BAN_PHUC_VU=${record.servedUnits || 'Chua co'}`,
        record.cccdServiceMode === 'TEMPORARILY_PAUSED' ? 'CANH_BAO=DIEM_CAP_CAN_CUOC_TAM_DUNG. Khong gioi thieu nhu diem dang hoat dong.' : '',
        `MATCHED_ALIAS=${record.matchedAlias || ''}`,
    ].filter(Boolean).join('\n');
}

function resetPublishedLocationsCache() {
    locationCache = null;
}

module.exports = {
    PUBLISHED_SHEET,
    GOOGLE_TIMEOUT_MS,
    LOCATION_CACHE_TTL_MS,
    LOCATION_CACHE_STALE_MAX_MS,
    parseGoogleVisualizationPayload,
    fetchGoogleVisualizationPayload,
    getPublishedLocations,
    isLocationLookupRequested,
    hasLocationEvidence,
    extractLocationEvidence,
    buildLookupTexts,
    isBarePlaceNameQuery,
    isNationalityAnswerContext,
    findVerifiedLocationMatches,
    formatVerifiedLocationsPrompt,
    asksForCitizenIdLocation,
    getGoogleMapsUrl,
    resetPublishedLocationsCache,
};
