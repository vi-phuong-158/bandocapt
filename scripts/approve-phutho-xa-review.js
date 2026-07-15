'use strict';

// Ghi nhận quyết định duyệt T3.3 cho toàn bộ thủ tục cấp xã đang ở trạng thái
// ready_for_approval. Mặc định chỉ preview; --apply mới tạo manifest duyệt.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { parseCsv } = require('./scrape-phutho-tthc');

const ROOT = path.resolve(__dirname, '..');
const REVIEW_PATH = path.join(ROOT, 'data', 'tthc-phutho-xa-review.csv');
const OUT_PATH = path.join(ROOT, 'data', 'tthc-phutho-xa-review-decisions.json');
const SNAPSHOT_PATH = path.join(ROOT, 'data', 'tthc-phutho-source.json');

function buildApprovalManifest(rows, snapshotBuffer, approvedAt) {
    const active = rows.filter(row => ['create_new', 'update_existing'].includes(row.recommended_action));
    const excluded = rows.filter(row => row.recommended_action === 'exclude_superseded');
    if (rows.length !== 43 || active.length !== 42 || excluded.length !== 1) {
        throw new Error(`Bảng duyệt không đúng phạm vi 43/42/1: ${rows.length}/${active.length}/${excluded.length}.`);
    }
    if (excluded[0].site_id !== '2373-17') throw new Error('Mục loại phải là luồng Phiếu/NA17 site_id=2373-17.');
    const decisionsBySiteId = {};
    for (const row of active) {
        decisionsBySiteId[row.site_id] = {
            final_decision: 'approve',
            reviewer_note: 'Người dùng duyệt thủ tục cấp xã hiện hành ngày 2026-07-15.',
            proposed_id: row.proposed_id,
            action: row.recommended_action,
            source_content_hash: row.content_hash
        };
    }
    decisionsBySiteId[excluded[0].site_id] = {
        final_decision: 'reject',
        reviewer_note: 'Luồng Phiếu/NA17 không còn sử dụng trong thực tế.',
        proposed_id: excluded[0].proposed_id,
        action: 'exclude_superseded',
        source_content_hash: excluded[0].content_hash
    };
    return {
        schema_version: 1,
        decided_at: approvedAt,
        decided_by: 'project_user',
        source_snapshot: 'data/tthc-phutho-source.json',
        source_snapshot_sha256: crypto.createHash('sha256').update(snapshotBuffer).digest('hex'),
        approval_scope: 'all 42 current commune-level procedures; exclude paper/NA17 procedure',
        decisions_by_site_id: decisionsBySiteId
    };
}

function main() {
    const apply = process.argv.includes('--apply');
    const snapshotBuffer = fs.readFileSync(SNAPSHOT_PATH);
    const rows = parseCsv(fs.readFileSync(REVIEW_PATH, 'utf8'));
    const manifest = buildApprovalManifest(rows, snapshotBuffer, new Date().toISOString());
    if (apply) fs.writeFileSync(OUT_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify({
        mode: apply ? 'apply' : 'dry-run',
        output: path.relative(ROOT, OUT_PATH),
        approved: Object.values(manifest.decisions_by_site_id).filter(row => row.final_decision === 'approve').length,
        rejected: Object.values(manifest.decisions_by_site_id).filter(row => row.final_decision === 'reject').length
    }, null, 2));
}

if (require.main === module) main();

module.exports = { buildApprovalManifest };
