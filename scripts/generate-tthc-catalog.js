'use strict';

// Sinh data/tthc-catalog.json cho panel doi chieu TTHC.
// Nguon uu tien: Pinecone live (neu co env hop le) de khong bi lech scope.
// Fallback: backup trong repo de van build duoc offline.
// Mac dinh xuat catalog day du (source_type='tthc' + guide da loc noi dung rong/noi bo).
// Dung --exclude-guides khi can snapshot chi TTHC that de audit.
// Chay:
//   node scripts/generate-tthc-catalog.js
//   node scripts/generate-tthc-catalog.js --source=live
//   node scripts/generate-tthc-catalog.js --source=live --include-guides
//   node scripts/generate-tthc-catalog.js --source=live --exclude-guides
//   node scripts/generate-tthc-catalog.js --source=backups
//   node scripts/generate-tthc-catalog.js --fetch-missing   (legacy backup mode)

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(ROOT, 'data', 'pinecone-backups');
const OUTPUT_PATH = path.join(ROOT, 'data', 'tthc-catalog.json');
const INDEX_OUTPUT_PATH = path.join(ROOT, 'data', 'tthc-index.json');

const ORIGINAL_BACKUP_FILE = '2026-07-01-pre-update-backup-original-metadata.json';
const NEW_RECORD_FILE = '2026-07-01-new-record-matt26265-khai-bao-tam-tru-online.json';
const AUDIT_FILE = '2026-07-01-audit-after-fix.json';

const UNVERIFIED_FEE = 'Chưa xác minh';
const DEFAULT_INDEX_NAME = 'chatbot-tthc-xnc';
const DEFAULT_NAMESPACE = 'chatbot-tthc-xnc';
const PINECONE_RETRY_ATTEMPTS = 3;

const CAP_LABELS = {
    'trung-uong': 'Cấp Trung ương',
    'tinh': 'Cấp Tỉnh',
    'xa': 'Cấp Xã',
};

const CAP_RANK = { 'trung-uong': 0, tinh: 1, xa: 2 };

const CATEGORY_ORDER = [
    'ho_chieu',
    'thi_thuc',
    'xuat_nhap_canh',
    'cu_tru',
    'tam_tru',
    'thuong_tru',
    'giay_thong_hanh',
    'tai_khoan_dien_tu',
    'dinh_danh_dien_tu',
    'xac_nhan_thong_tin',
    'can_cuoc',
    'dang_ky_xe',
    'dac_doanh',
    'vu_khi',
    'khieu_nai_to_cao',
    'nguoi_khong_quoc_tich',
    'khu_vuc_cam_bien_gioi',
];

const CATEGORY_LABEL_FALLBACK = {
    ho_chieu: 'Hộ chiếu',
    thi_thuc: 'Thị thực và e-visa',
    xuat_nhap_canh: 'Xuất nhập cảnh',
    cu_tru: 'Cư trú',
    tam_tru: 'Tạm trú',
    thuong_tru: 'Thường trú',
    giay_thong_hanh: 'Giấy thông hành',
    tai_khoan_dien_tu: 'Tài khoản điện tử',
    dinh_danh_dien_tu: 'Định danh điện tử',
    xac_nhan_thong_tin: 'Xác nhận và cung cấp thông tin',
    can_cuoc: 'Căn cước',
    dang_ky_xe: 'Đăng ký xe',
    dac_doanh: 'Ngành nghề có điều kiện về ANTT',
    vu_khi: 'Vũ khí, vật liệu nổ, công cụ hỗ trợ',
    khieu_nai_to_cao: 'Khiếu nại, tố cáo',
    nguoi_khong_quoc_tich: 'Người không quốc tịch',
    khu_vuc_cam_bien_gioi: 'Khu vực cấm, biên giới',
};

const GUIDE_SECTION_ORDER = [
    'Toan van thu tuc',
    'Trinh tu thuc hien',
    'Cach thuc thuc hien',
    'Thanh phan, so luong ho so',
    'Thoi han giai quyet',
    'Doi tuong thuc hien thu tuc hanh chinh',
    'Co quan thuc hien thu tuc hanh chinh',
    'Co quan giai quyet thu tuc hanh chinh',
    'Ket qua thuc hien thu tuc hanh chinh',
    'Phi, le phi',
    'Le phi',
    'Phi',
    'Ten mau don, mau to khai',
    'Yeu cau, dieu kien thuc hien thu tuc hanh chinh',
    'Can cu phap ly cua thu tuc hanh chinh',
];

function loadJson(fileName) {
    return JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, fileName), 'utf8'));
}

function readEnvAssignments(content) {
    const result = new Map();
    for (const rawLine of String(content || '').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (!match) continue;
        result.set(match[1], stripWrappingQuotes(match[2].trim()));
    }
    return result;
}

function stripWrappingQuotes(value) {
    return String(value || '').replace(/^["']|["']$/g, '');
}

function hasNonEmptyValue(value) {
    return String(value || '').trim() !== '';
}

function loadEnvFilesPreferNonEmpty() {
    const candidates = [path.join(ROOT, '.env'), path.join(ROOT, '.env.local')];

    for (const envPath of candidates) {
        if (!fs.existsSync(envPath)) continue;
        const entries = readEnvAssignments(fs.readFileSync(envPath, 'utf8'));
        for (const [key, value] of entries.entries()) {
            if (!hasNonEmptyValue(value)) continue;
            process.env[key] = value;
        }
    }
}

function getPineconeConfig() {
    loadEnvFilesPreferNonEmpty();

    return {
        apiKey: hasNonEmptyValue(process.env.PINECONE_API_KEY) ? process.env.PINECONE_API_KEY.trim() : '',
        indexName: hasNonEmptyValue(process.env.PINECONE_INDEX_NAME) ? process.env.PINECONE_INDEX_NAME.trim() : DEFAULT_INDEX_NAME,
        indexHost: hasNonEmptyValue(process.env.PINECONE_INDEX_HOST) ? process.env.PINECONE_INDEX_HOST.trim() : '',
        namespace: hasNonEmptyValue(process.env.PINECONE_NAMESPACE) ? process.env.PINECONE_NAMESPACE.trim() : DEFAULT_NAMESPACE,
    };
}

async function retryPinecone(operation, label, attempts = PINECONE_RETRY_ATTEMPTS) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (attempt === attempts) break;
            console.warn(`[generate-tthc-catalog] Pinecone retry ${attempt}/${attempts - 1} for ${label}: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        }
    }
    throw lastError;
}

function hasUsablePineconeConfig() {
    return hasNonEmptyValue(getPineconeConfig().apiKey);
}

function deriveCategoryLabel(record) {
    const match = String(record.text || '').match(/^(?:Loai thu tuc|Loại thủ tục):\s*(.+)$/mi);
    if (match) return match[1].trim();
    return CATEGORY_LABEL_FALLBACK[record.loai_thu_tuc] || record.loai_thu_tuc;
}

function buildFeeIndex(audit) {
    const index = new Map();
    for (const entry of audit) {
        index.set(entry.procedure_id, { le_phi: entry.le_phi, phi: entry.phi });
    }
    return index;
}

function formatFee(feeEntry) {
    if (!feeEntry) return UNVERIFIED_FEE;

    const lePhi = String(feeEntry.le_phi || '').trim();
    const phi = String(feeEntry.phi || '').trim();

    if (lePhi === UNVERIFIED_FEE || phi === UNVERIFIED_FEE) return UNVERIFIED_FEE;

    const parts = [];
    if (lePhi && lePhi !== 'Không') parts.push(`Lệ phí: ${lePhi}`);
    if (phi && phi !== 'Không') parts.push(`Phí: ${phi}`);
    return parts.length ? parts.join(' · ') : 'Không';
}

function resolveFee(record, feeIndex) {
    const audited = feeIndex.get(record.procedure_id);
    if (audited) return audited;
    if (record.le_phi || record.phi) return { le_phi: record.le_phi, phi: record.phi };
    return undefined;
}

function toProcedure(id, record, feeIndex) {
    return {
        id,
        procedureId: record.procedure_id,
        title: record.title,
        category: record.loai_thu_tuc,
        categoryLabel: deriveCategoryLabel(record),
        cap: record.cap,
        capLabel: CAP_LABELS[record.cap] || record.cap,
        fee: formatFee(resolveFee(record, feeIndex)),
        sourceDecision: record.source_decision,
        text: record.text,
    };
}

function categoryRank(category) {
    const idx = CATEGORY_ORDER.indexOf(category);
    return idx === -1 ? CATEGORY_ORDER.length : idx;
}

function sortProcedures(procedures) {
    return [...procedures].sort((a, b) => {
        const catDiff = categoryRank(a.category) - categoryRank(b.category);
        if (catDiff !== 0) return catDiff;
        const capDiff = (CAP_RANK[a.cap] ?? 3) - (CAP_RANK[b.cap] ?? 3);
        if (capDiff !== 0) return capDiff;
        return a.title.localeCompare(b.title, 'vi');
    });
}

function buildCategorySummary(procedures) {
    const counts = new Map();
    for (const proc of procedures) {
        const existing = counts.get(proc.category) || { key: proc.category, label: proc.categoryLabel, count: 0 };
        existing.count += 1;
        counts.set(proc.category, existing);
    }
    return [...counts.values()].sort((a, b) => categoryRank(a.key) - categoryRank(b.key));
}

function normalizeWhitespace(value) {
    return String(value || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

function readGuideField(text, label) {
    const prefix = `${label}:`;
    for (const rawLine of String(text || '').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (line.startsWith(prefix)) {
            return normalizeWhitespace(line.slice(prefix.length));
        }
    }
    return '';
}

function readGuideBody(text) {
    const lines = String(text || '').split(/\r?\n/);
    const marker = lines.findIndex(line => line.trim() === 'Noi dung wiki:' || line.trim() === 'Nội dung wiki:');
    if (marker === -1) return '';
    return lines.slice(marker + 1).join('\n').trim();
}

function slugify(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function normalizeProcedureTitle(value) {
    return slugify(String(value || '').replace(/\s*-\s*toan van thu tuc$/i, '').trim());
}

function mapGuideCap(capLabel) {
    const normalized = slugify(capLabel);
    if (normalized.includes('trung-uong')) return 'trung-uong';
    if (normalized.includes('tinh')) return 'tinh';
    return 'xa';
}

function mapGuideCategory(record, categoryLabel) {
    const base = slugify(record.loai_thu_tuc || '');
    if (base === 'xac-thuc-dien-tu' || base === 'dinh-danh-va-xac-thuc-dien-tu') return 'dinh_danh_dien_tu';
    if (base === 'can-cuoc') return 'can_cuoc';
    if (base === 'dang-ky-xe') return 'dang_ky_xe';
    if (base === 'dac-doanh') return 'dac_doanh';
    if (base === 'cu-tru') return 'cu_tru';
    if (base === 'xuat-nhap-canh') return 'xuat_nhap_canh';

    const label = slugify(categoryLabel);
    if (label.includes('cu-tru')) return 'cu_tru';
    if (label.includes('xuat-nhap-canh')) return 'xuat_nhap_canh';
    if (label.includes('can-cuoc')) return 'can_cuoc';
    if (label.includes('dang-ky-xe')) return 'dang_ky_xe';
    if (label.includes('an-ninh-trat-tu')) return 'dac_doanh';
    if (label.includes('dinh-danh')) return 'dinh_danh_dien_tu';

    return record.loai_thu_tuc || 'xuat_nhap_canh';
}

function normalizeGuideSectionTitle(value) {
    return slugify(value).replace(/-/g, ' ');
}

function getGuideSectionRank(sectionTitle, vectorId) {
    const normalized = normalizeGuideSectionTitle(sectionTitle);
    const exactIndex = GUIDE_SECTION_ORDER.findIndex(item => normalizeGuideSectionTitle(item) === normalized);
    if (exactIndex !== -1) return exactIndex;

    const fuzzyIndex = GUIDE_SECTION_ORDER.findIndex(item => normalized.includes(normalizeGuideSectionTitle(item)));
    if (fuzzyIndex !== -1) return fuzzyIndex;

    const idMatch = String(vectorId || '').match(/_(\d{2})_(\d{2})$/);
    if (idMatch) return 100 + Number(idMatch[1]);
    return 999;
}

function cleanGuideSectionTitle(sectionTitle) {
    return normalizeWhitespace(String(sectionTitle || ''));
}

function buildGuideSectionText(section) {
    const title = cleanGuideSectionTitle(section.sectionTitle);
    const body = section.sectionBody || '';

    if (!title && body) return body;
    if (slugify(title) === 'toan-van-thu-tuc') return `Nội dung:\n${body}`;
    return `${title}:\n${body}`;
}

function trimGuideFeeText(value) {
    return normalizeWhitespace(
        String(value || '')
            .replace(/^\d+(?:\.\d+)*\.?\s*/g, '')
            .replace(/^[-+]\s*/g, '')
            .replace(/^(?:Phí,?\s*lệ phí|Phi,?\s*le phi)[:\s-]*/i, '')
            .replace(/^(?:Lệ phí|Le phi)(?:\s*\((?:nếu có|neu co)\))?[:\s-]*/i, '')
            .replace(/^(?:Phí|Phi)[:\s-]*/i, '')
    );
}

function summarizeGuideFee(value) {
    const lines = String(value || '')
        .split(/\r?\n/)
        .map(trimGuideFeeText)
        .filter(Boolean);

    if (lines.length === 0) return '';

    const summary = lines.slice(0, 3).join(' | ');
    return summary.length > 220 ? `${summary.slice(0, 217).trim()}...` : summary;
}

function extractGuideFee(sections) {
    for (const section of sections) {
        const sectionTitle = String(section.sectionTitle || '');
        const normalizedTitle = slugify(sectionTitle);
        if (!normalizedTitle.includes('phi')) continue;

        const bodyFee = summarizeGuideFee(section.sectionBody);
        if (bodyFee) return bodyFee;
    }

    return UNVERIFIED_FEE;
}

function parseGuideProcedureRecord(vectorId, metadata) {
    const text = String(metadata.text || '');
    const categoryLabel = readGuideField(text, 'Linh vuc') || readGuideField(text, 'Lĩnh vực') || CATEGORY_LABEL_FALLBACK[metadata.loai_thu_tuc] || metadata.loai_thu_tuc;
    const capLabel = readGuideField(text, 'Cap xu ly') || readGuideField(text, 'Cấp xử lý') || 'Cấp Xã';
    const title = readGuideField(text, 'Thu tuc') || readGuideField(text, 'Thủ tục') || metadata.article || metadata.title || vectorId;
    const sectionTitle = readGuideField(text, 'Muc wiki') || readGuideField(text, 'Mục wiki') || metadata.article || 'Toan van thu tuc';
    const sectionBody = readGuideBody(text);

    return {
        vectorId,
        sourceDecision: metadata.source_file || metadata.source || '',
        category: mapGuideCategory(metadata, categoryLabel),
        categoryLabel,
        cap: mapGuideCap(capLabel),
        capLabel,
        title: normalizeWhitespace(title),
        sectionTitle: normalizeWhitespace(sectionTitle),
        sectionBody,
        sectionRank: getGuideSectionRank(sectionTitle, vectorId),
    };
}

// Loại các "mục" guide thực chất là nội dung nội bộ chatbot (nguyên tắc trả lời,
// ghi chú cho quản trị viên, câu hỏi mẫu 'Người dùng: "..."') — không phải thủ tục
// hành chính, không được lộ ra danh mục công khai.
const INTERNAL_GUIDE_TITLE_PATTERN = /(nguyên tắc trả lời|quản trị viên|chatbot|^người dùng\s*:)/i;

function buildGuideProcedures(guideRecords, tthcProcedures = []) {
    const takenTitles = new Set(tthcProcedures.map(proc => normalizeProcedureTitle(proc.title)));
    const grouped = new Map();

    for (const record of guideRecords) {
        const parsed = parseGuideProcedureRecord(record.id, record.metadata);
        const normalizedTitle = normalizeProcedureTitle(parsed.title);

        if (!normalizedTitle || takenTitles.has(normalizedTitle)) continue;
        if (INTERNAL_GUIDE_TITLE_PATTERN.test(parsed.title)) continue;
        if (!parsed.sectionBody) continue;

        const key = `${parsed.category}|${parsed.cap}|${normalizedTitle}`;
        const existing = grouped.get(key) || {
            id: `guide_${slugify(parsed.category)}_${slugify(parsed.title)}`,
            procedureId: `guide:${slugify(parsed.category)}:${slugify(parsed.title)}`,
            title: parsed.title,
            category: parsed.category,
            categoryLabel: parsed.categoryLabel || CATEGORY_LABEL_FALLBACK[parsed.category] || parsed.category,
            cap: parsed.cap,
            capLabel: parsed.capLabel || CAP_LABELS[parsed.cap] || parsed.cap,
            sourceDecision: parsed.sourceDecision,
            sections: [],
        };

        existing.sections.push({
            vectorId: parsed.vectorId,
            sectionTitle: parsed.sectionTitle,
            sectionBody: parsed.sectionBody,
            sectionRank: parsed.sectionRank,
        });

        grouped.set(key, existing);
    }

    const procedures = [];
    for (const entry of grouped.values()) {
        entry.sections.sort((a, b) => {
            if (a.sectionRank !== b.sectionRank) return a.sectionRank - b.sectionRank;
            return a.vectorId.localeCompare(b.vectorId, 'vi');
        });

        procedures.push({
            id: entry.id,
            procedureId: entry.procedureId,
            title: entry.title,
            category: entry.category,
            categoryLabel: entry.categoryLabel,
            cap: entry.cap,
            capLabel: entry.capLabel,
            fee: extractGuideFee(entry.sections),
            sourceDecision: entry.sourceDecision,
            text: [
                `Tên thủ tục: ${entry.title}`,
                `Loại thủ tục: ${entry.categoryLabel}`,
                `Cấp xử lý: ${entry.capLabel}`,
                `Nguồn: ${entry.sourceDecision || 'Tài liệu wiki thủ tục hành chính'}`,
                '',
                ...entry.sections.map(buildGuideSectionText),
            ].join('\n').trim(),
        });
    }

    return procedures;
}

function buildCatalogFromBackups({ original, newRecord, audit, extraRecords = [], generatedAt }) {
    const feeIndex = buildFeeIndex(audit);
    const procedures = [];

    for (const [id, record] of Object.entries(original)) {
        procedures.push(toProcedure(id, record, feeIndex));
    }

    procedures.push(toProcedure(`tthc_${newRecord.procedure_id}`, newRecord, feeIndex));

    for (const record of extraRecords) {
        procedures.push(toProcedure(`tthc_${record.procedure_id}`, record, feeIndex));
    }

    const knownProcedureIds = new Set(procedures.map(proc => proc.procedureId));
    const missingFromBackups = audit
        .map(entry => entry.procedure_id)
        .filter(procedureId => !knownProcedureIds.has(procedureId))
        .sort();

    const { procedures: deduped } = dedupeProcedures(procedures);
    const sortedProcedures = sortProcedures(deduped);

    return {
        generatedAt: generatedAt || new Date().toISOString(),
        feeVerifiedAt: '2026-07-01',
        sourceMode: 'backups',
        missingFromBackups,
        categories: buildCategorySummary(sortedProcedures),
        procedures: sortedProcedures,
    };
}

// Điểm dữ liệu đầy đủ hơn được ưu tiên khi gộp trùng: lệ phí đã xác minh > "Chưa xác minh",
// sau đó tới text dài hơn (nhiều nội dung để đối sánh hơn).
function procedureRichnessScore(proc) {
    const feeVerified = proc.fee && proc.fee !== UNVERIFIED_FEE ? 1 : 0;
    return feeVerified * 1e7 + String(proc.text || '').length;
}

// Gộp các thủ tục trùng (cùng lĩnh vực + cấp + tên chuẩn hóa), giữ bản đầy đủ hơn.
function dedupeProcedures(procedures) {
    const byKey = new Map();
    let dropped = 0;
    for (const proc of procedures) {
        const key = `${proc.category}|${proc.cap}|${normalizeProcedureTitle(proc.title)}`;
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, proc);
            continue;
        }
        dropped += 1;
        if (procedureRichnessScore(proc) > procedureRichnessScore(existing)) {
            byKey.set(key, proc);
        }
    }
    return { procedures: [...byKey.values()], dropped };
}

// Catalog san pham gom ca TTHC that va guide da loc; --exclude-guides chi dung khi can
// audit rieng tap source_type='tthc'.
function buildCatalogFromLiveRecords({ tthcRecords, guideRecords, audit, generatedAt, includeGuides = false }) {
    const feeIndex = buildFeeIndex(audit);
    const tthcProcedures = tthcRecords.map(record => toProcedure(record.id, record.metadata, feeIndex));
    const guideProcedures = includeGuides ? buildGuideProcedures(guideRecords, tthcProcedures) : [];
    const combinedProcedures = [...tthcProcedures, ...guideProcedures];
    const { procedures: deduped } = dedupeProcedures(combinedProcedures);
    const sortedProcedures = sortProcedures(deduped);

    // missingFromBackups = thủ tục trong audit lệ phí nhưng KHÔNG được tải về từ Pinecone.
    // Tính trên tập TRƯỚC dedup: bản trùng bị gộp vẫn coi là "có" (thủ tục còn dưới id sinh đôi).
    // Ở live mode đủ dữ liệu, danh sách này rỗng — không còn liệt kê nhầm.
    const fetchedProcedureIds = new Set(combinedProcedures.map(proc => proc.procedureId));
    const missingFromBackups = audit
        .map(entry => entry.procedure_id)
        .filter(procedureId => !fetchedProcedureIds.has(procedureId))
        .sort();

    return {
        generatedAt: generatedAt || new Date().toISOString(),
        feeVerifiedAt: '2026-07-01',
        sourceMode: 'live',
        includeGuides,
        missingFromBackups,
        categories: buildCategorySummary(sortedProcedures),
        procedures: sortedProcedures,
    };
}

function buildCatalog(options) {
    if (Array.isArray(options?.tthcRecords) || Array.isArray(options?.guideRecords)) {
        return buildCatalogFromLiveRecords(options);
    }
    return buildCatalogFromBackups(options);
}

async function fetchMissingRecords(missingProcedureIds) {
    if (missingProcedureIds.length === 0) return [];

    const config = getPineconeConfig();
    if (!config.apiKey) {
        throw new Error(
            'Thieu PINECONE_API_KEY (kiem tra .env/.env.local). --fetch-missing can key de backfill.'
        );
    }

    const { Pinecone } = require('@pinecone-database/pinecone');
    const pc = new Pinecone({ apiKey: config.apiKey });
    const baseIndex = pc.index(config.indexName, config.indexHost || undefined);
    const activeIndex = config.namespace ? baseIndex.namespace(config.namespace) : baseIndex;

    const vectorIds = missingProcedureIds.map(id => `tthc_${id}`);
    const result = await retryPinecone(
        () => activeIndex.fetch(vectorIds),
        `fetch missing (${vectorIds.length} ids)`
    );
    const records = [];

    for (const [vectorId, vector] of Object.entries(result.records || {})) {
        const metadata = vector.metadata || {};
        if (!metadata.title || !metadata.text) {
            console.warn(`[generate-tthc-catalog] ${vectorId}: thieu title/text trong metadata Pinecone, bo qua.`);
            continue;
        }
        records.push(metadata);
    }

    return records;
}

async function fetchAllCatalogRecordsFromPinecone() {
    const config = getPineconeConfig();
    if (!config.apiKey) {
        throw new Error('Thieu PINECONE_API_KEY de tai catalog tu Pinecone live.');
    }

    const { Pinecone } = require('@pinecone-database/pinecone');
    const pc = new Pinecone({ apiKey: config.apiKey });
    const baseIndex = pc.index(config.indexName, config.indexHost || undefined);
    const activeIndex = config.namespace ? baseIndex.namespace(config.namespace) : baseIndex;

    let paginationToken;
    const vectorIds = [];

    do {
        const page = await retryPinecone(
            () => activeIndex.listPaginated({ limit: 100, paginationToken }),
            `list page (${paginationToken || 'first'})`
        );
        for (const vector of page.vectors || []) {
            vectorIds.push(vector.id);
        }
        paginationToken = page.pagination?.next;
    } while (paginationToken);

    const records = [];
    for (let index = 0; index < vectorIds.length; index += 100) {
        const batchIds = vectorIds.slice(index, index + 100);
        const batchResult = await retryPinecone(
            () => activeIndex.fetch(batchIds),
            `fetch batch ${index / 100 + 1}`
        );

        for (const id of batchIds) {
            const metadata = batchResult.records?.[id]?.metadata;
            if (!metadata || !metadata.text) continue;
            records.push({ id, metadata });
        }
    }

    const tthcRecords = records.filter(record => record.metadata.source_type === 'tthc' && record.metadata.title);
    const guideRecords = records.filter(record => record.metadata.source_type === 'guide');

    return { tthcRecords, guideRecords };
}

function parseArgs(argv) {
    const sourceArg = argv.find(arg => arg.startsWith('--source='));
    const source = sourceArg ? sourceArg.split('=')[1] : 'auto';
    return {
        source,
        fetchMissing: argv.includes('--fetch-missing'),
        includeGuides: argv.includes('--exclude-guides') ? false : true,
        indexOnly: argv.includes('--index-only'),
    };
}

function getBackupInputs() {
    return {
        original: loadJson(ORIGINAL_BACKUP_FILE),
        newRecord: loadJson(NEW_RECORD_FILE),
        audit: loadJson(AUDIT_FILE),
    };
}

function getMissingFromBackupIds(original, newRecord, audit) {
    const knownIds = new Set([...Object.values(original).map(record => record.procedure_id), newRecord.procedure_id]);
    return audit.map(entry => entry.procedure_id).filter(id => !knownIds.has(id));
}

function buildCatalogIndex(catalog) {
    return {
        schemaVersion: 1,
        generatedAt: catalog.generatedAt,
        procedures: (catalog.procedures || []).map(procedure => ({
            procedure_id: procedure.procedureId,
            title: procedure.title,
            aliases: Array.isArray(procedure.aliases) ? procedure.aliases : [],
        })),
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.indexOnly) {
        const catalog = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
        fs.writeFileSync(INDEX_OUTPUT_PATH, JSON.stringify(buildCatalogIndex(catalog)) + '\n', 'utf8');
        console.log(`[generate-tthc-catalog] Da ghi index ${path.relative(ROOT, INDEX_OUTPUT_PATH)} tu catalog hien co.`);
        return;
    }
    const { original, newRecord, audit } = getBackupInputs();
    let catalog;

    if (args.source === 'live' || (args.source === 'auto' && hasUsablePineconeConfig())) {
        const live = await fetchAllCatalogRecordsFromPinecone();
        catalog = buildCatalogFromLiveRecords({
            ...live,
            audit,
            includeGuides: args.includeGuides,
        });
    } else {
        let extraRecords = [];
        if (args.fetchMissing) {
            extraRecords = await fetchMissingRecords(getMissingFromBackupIds(original, newRecord, audit));
        }
        catalog = buildCatalogFromBackups({ original, newRecord, audit, extraRecords });
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
    const catalogIndex = buildCatalogIndex(catalog);
    fs.writeFileSync(INDEX_OUTPUT_PATH, JSON.stringify(catalogIndex) + '\n', 'utf8');

    console.log(
        `[generate-tthc-catalog] Da ghi ${catalog.procedures.length} thu tuc vao ${path.relative(ROOT, OUTPUT_PATH)} ` +
        `va index ${path.relative(ROOT, INDEX_OUTPUT_PATH)} ` +
        `(source=${catalog.sourceMode}, guides=${catalog.includeGuides ? 'on' : 'off'}).`
    );

    if (catalog.missingFromBackups.length > 0) {
        console.warn(
            `[generate-tthc-catalog] Ghi chu: ${catalog.missingFromBackups.length} thu tuc tthc chua co day du trong backup repo: ` +
            `${catalog.missingFromBackups.join(', ')}.`
        );
    }
}

module.exports = {
    buildCatalog,
    buildCatalogFromBackups,
    buildCatalogFromLiveRecords,
    buildGuideProcedures,
    buildFeeIndex,
    buildCategorySummary,
    buildCatalogIndex,
    dedupeProcedures,
    deriveCategoryLabel,
    fetchMissingRecords,
    formatFee,
    getMissingFromBackupIds,
    hasNonEmptyValue,
    loadEnvFilesPreferNonEmpty,
    normalizeProcedureTitle,
    parseArgs,
    parseGuideProcedureRecord,
    readEnvAssignments,
    resolveFee,
    sortProcedures,
    trimGuideFeeText,
};

if (require.main === module) {
    main().catch(err => {
        console.error('[generate-tthc-catalog] Loi:', err);
        process.exitCode = 1;
    });
}
