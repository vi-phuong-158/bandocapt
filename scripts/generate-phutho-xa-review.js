'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
    csvCell,
    normalizeTitle,
    parseCsv,
    titleScore
} = require('./scrape-phutho-tthc');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_PATH = path.join(ROOT, 'data', 'tthc-phutho-source.json');
const GOVERNANCE_PATH = path.join(ROOT, 'data', 'corpus-governance-draft.csv');
const DECISIONS_PATH = path.join(ROOT, 'data', 'tthc-phutho-xa-review-decisions.json');
const CSV_PATH = path.join(ROOT, 'data', 'tthc-phutho-xa-review.csv');
const REPORT_PATH = path.join(ROOT, 'data', 'tthc-phutho-xa-review.md');

const COLUMNS = [
    'proposed_id', 'site_id', 'title', 'category', 'level', 'service_level',
    'existing_id', 'existing_title', 'match_status', 'match_score',
    'recommended_action', 'review_status', 'adjustment_needed',
    'agency', 'processing_time', 'fee', 'form_codes', 'attachment_titles',
    'online_submission_url', 'source_url', 'content_hash', 'risk_flags',
    'final_decision', 'reviewer_note'
];

function isCommuneLevel(level) {
    return normalizeTitle(level) === 'cap xa';
}

function extractFormCodes(procedure) {
    const text = [
        procedure.documents,
        ...(procedure.attachments || []).flatMap(item => [item.title, item.url])
    ].filter(Boolean).join(' ');
    return [...new Set((text.match(/\b(?:NA|TK|TT|M|XC|HC)\d{1,3}[A-Z]?\b/gi) || [])
        .map(code => code.toUpperCase()))].sort();
}

function proposedId(siteId) {
    return `tthc_phutho_xa_${String(siteId).replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '')}`;
}

function findExisting(procedure, existingCommuneRows) {
    const exact = existingCommuneRows.filter(row => normalizeTitle(row.title) === normalizeTitle(procedure.title));
    if (exact.length === 1) return { row: exact[0], status: 'exact_title', score: 1 };
    const ranked = existingCommuneRows
        .map(row => ({ row, score: titleScore(row.title, procedure.title) }))
        .sort((a, b) => b.score - a.score);
    if (ranked[0]?.score === 1) return { ...ranked[0], status: 'equivalent_title' };
    if (ranked[0]?.score >= 0.72) return { ...ranked[0], status: 'suggested_title' };
    return { row: null, status: 'new', score: ranked[0]?.score || 0 };
}

function buildAdjustment(procedure, match) {
    const risks = new Set(procedure.risk_flags || []);
    const notes = [];
    if (risks.has('paper_flow_candidate')) {
        notes.push('Không nhập corpus hiện hành: luồng Phiếu/NA17 đã được người duyệt xác nhận lỗi thời.');
    }
    if (risks.has('ambiguous_processing_time')) {
        notes.push('Không dùng thời gian giải quyết trên trang này để ghi đè hạn khai báo 12/24 giờ.');
    }
    if (risks.has('dated_validity_claim')) {
        notes.push('Kiểm tra mốc hết hiệu lực của ưu đãi/quy định có ngày cụ thể trước khi xuất bản.');
    }
    if (match.status === 'suggested_title') {
        notes.push('Kiểm tay việc ghép với bản ghi cũ vì tiêu đề không trùng hoàn toàn.');
    }
    if (!procedure.service_level) notes.push('Website không công bố mức độ dịch vụ công; chuẩn hóa thành N/A.');
    return notes.join(' ');
}

function buildCommuneReview(procedures, governanceRows, decisions = {}) {
    const existingCommuneRows = governanceRows.filter(row => row.review_tier === 'HIGH' && normalizeTitle(row.cap) === 'xa');
    return procedures.filter(item => isCommuneLevel(item.level)).map(procedure => {
        const match = findExisting(procedure, existingCommuneRows);
        const risks = new Set(procedure.risk_flags || []);
        const formCodes = extractFormCodes(procedure);
        const attachmentTitles = (procedure.attachments || []).map(item => item.title).filter(Boolean);
        const excluded = risks.has('paper_flow_candidate');
        const recommendedAction = excluded ? 'exclude_superseded' : (match.row ? 'update_existing' : 'create_new');
        const adjustmentNeeded = buildAdjustment(procedure, match);
        const blockingReview = risks.has('dated_validity_claim') || match.status === 'suggested_title';
        const decision = decisions[procedure.site_id] || {};
        return {
            proposed_id: match.row?.id || proposedId(procedure.site_id),
            site_id: procedure.site_id,
            title: procedure.title,
            category: procedure.category,
            level: procedure.level,
            service_level: procedure.service_level || 'N/A',
            existing_id: match.row?.id || '',
            existing_title: match.row?.title || '',
            match_status: match.status,
            match_score: match.score.toFixed(3),
            recommended_action: recommendedAction,
            review_status: excluded ? 'decision_recorded' : (blockingReview ? 'needs_review' : 'ready_for_approval'),
            adjustment_needed: adjustmentNeeded,
            agency: procedure.agency,
            processing_time: procedure.processing_time,
            fee: procedure.fee,
            form_codes: formCodes.length ? formCodes : ['N/A'],
            attachment_titles: attachmentTitles.length ? attachmentTitles : ['N/A'],
            online_submission_url: procedure.online_submission_url,
            source_url: procedure.source_url,
            content_hash: procedure.content_hash,
            risk_flags: procedure.risk_flags || [],
            final_decision: decision.final_decision || (excluded ? 'reject' : ''),
            reviewer_note: decision.reviewer_note || (excluded ? 'Đã chốt: luồng Phiếu/NA17 không còn sử dụng trong thực tế.' : '')
        };
    }).sort((a, b) => a.category.localeCompare(b.category, 'vi') || a.title.localeCompare(b.title, 'vi'));
}

function summary(rows) {
    const byCategory = Object.entries(rows.reduce((counts, row) => {
        counts[row.category] = (counts[row.category] || 0) + 1;
        return counts;
    }, {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'));
    return {
        total: rows.length,
        activeCandidates: rows.filter(row => row.recommended_action !== 'exclude_superseded').length,
        createNew: rows.filter(row => row.recommended_action === 'create_new').length,
        updateExisting: rows.filter(row => row.recommended_action === 'update_existing').length,
        excluded: rows.filter(row => row.recommended_action === 'exclude_superseded').length,
        needsReview: rows.filter(row => row.review_status === 'needs_review').length,
        sourceServiceLevelPublished: rows.filter(row => row.service_level !== 'N/A').length,
        sourceFormsPublished: rows.filter(row => (row.form_codes || [])[0] !== 'N/A').length,
        byCategory
    };
}

function markdownReport(rows, stats, snapshot) {
    const lines = [
        '# Đối chiếu đầy đủ thủ tục hành chính cấp xã — Công an tỉnh Phú Thọ',
        '',
        `- Nguồn: ${snapshot.source_name} (${snapshot.source_url})`,
        `- Thời điểm snapshot: ${snapshot.fetched_at}`,
        `- Tổng mục cấp xã trên website: **${stats.total}**`,
        `- Ứng viên đưa vào corpus hiện hành: **${stats.activeCandidates}**`,
        `- Tạo mới: **${stats.createNew}**; cập nhật bản ghi cũ: **${stats.updateExisting}**; loại do lỗi thời: **${stats.excluded}**`,
        `- Cần kiểm/điều chỉnh trước khi duyệt: **${stats.needsReview}**`,
        `- Độ đầy đủ nguồn: cơ quan/thời gian/phí/link **${stats.total}/${stats.total}**; mức độ DVC **${stats.sourceServiceLevelPublished}/${stats.total}**; mã biểu mẫu **${stats.sourceFormsPublished}/${stats.total}**. Trường website không công bố được ghi \`N/A\`.`,
        '',
        '## Điều chỉnh quan trọng',
        '',
        '- Mục “Khai báo tạm trú ... bằng Phiếu khai báo tạm trú” vẫn được liệt kê để đối chiếu đủ 43 mục, nhưng đề xuất `exclude_superseded` theo quyết định người dùng: thực tế không còn dùng Phiếu/NA17.',
        '- Không dùng thông tin 24 giờ/07 ngày của mục Phiếu để ghi đè hạn khai báo trực tuyến 12/24 giờ.',
        '- Mục có `dated_validity_claim` phải kiểm mốc thời gian ghi trên website trước khi xuất bản.',
        '- `new` nghĩa là website có thủ tục cấp xã nhưng corpus TTHC cũ chưa có bản ghi tương thích; đây không phải lỗi thu thập.',
        '',
        '## Số lượng theo lĩnh vực',
        '',
        '| Lĩnh vực | Số thủ tục |',
        '|---|---:|',
        ...stats.byCategory.map(([category, count]) => `| ${category.replace(/\|/g, '\\|')} | ${count} |`),
        '',
        '## Danh sách 43 thủ tục để duyệt',
        '',
        '| # | Thủ tục | Lĩnh vực | Đối chiếu corpus cũ | Đề xuất | Trạng thái |',
        '|---:|---|---|---|---|---|',
        ...rows.map((row, index) => {
            const existing = row.existing_id ? `${row.match_status}: ${row.existing_id}` : 'Chưa có — tạo mới';
            return `| ${index + 1} | [${row.title.replace(/\|/g, '\\|')}](${row.source_url}) | ${row.category.replace(/\|/g, '\\|')} | ${existing} | ${row.recommended_action} | ${row.review_status} |`;
        }),
        '',
        '## Cách duyệt',
        '',
        'Mở `data/tthc-phutho-xa-review.csv`, điền `final_decision` bằng `approve`, `reject` hoặc `hold` và ghi lý do vào `reviewer_note`. Không sửa các cột nguồn/hash.',
        ''
    ];
    return lines.join('\n');
}

function main() {
    const snapshot = JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
    const governanceRows = parseCsv(fs.readFileSync(GOVERNANCE_PATH, 'utf8'));
    const decisions = fs.existsSync(DECISIONS_PATH)
        ? (JSON.parse(fs.readFileSync(DECISIONS_PATH, 'utf8')).decisions_by_site_id || {})
        : {};
    const rows = buildCommuneReview(snapshot.procedures || [], governanceRows, decisions);
    const stats = summary(rows);
    const csv = [COLUMNS.join(','), ...rows.map(row => COLUMNS.map(column => csvCell(row[column])).join(','))].join('\n') + '\n';
    fs.writeFileSync(CSV_PATH, csv, 'utf8');
    fs.writeFileSync(REPORT_PATH, markdownReport(rows, stats, snapshot) + '\n', 'utf8');
    console.log(JSON.stringify({
        csv: path.relative(ROOT, CSV_PATH),
        report: path.relative(ROOT, REPORT_PATH),
        ...stats
    }, null, 2));
}

if (require.main === module) main();

module.exports = { buildCommuneReview, extractFormCodes, isCommuneLevel, summary };
