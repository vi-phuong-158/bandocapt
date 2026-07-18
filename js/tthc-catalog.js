// Danh mục thủ tục hành chính (TTHC) — duyệt 2 tầng (lĩnh vực → thủ tục) + chi tiết.
// Dữ liệu tĩnh từ data/tthc-catalog.json (sinh bởi scripts/generate-tthc-catalog.js).
// Public API: window.TthcCatalog.open() / openProcedure(procedureId) / close().

const TTHC_MODAL_BREAKPOINT = 767;
const TTHC_DETAIL_FALLBACK = 'Xem nội dung chi tiết bên dưới.';
const TTHC_FEE_FALLBACK = 'Chưa có thông tin chắc chắn trong dữ liệu hiện có.';

// Tập nhãn đóng trong trường text của mỗi thủ tục — dùng để in đậm đầu dòng, giữ nội dung nguyên văn.
const TTHC_LABEL_RE = /^([*+]\s*)?(Tên thủ tục|Loại thủ tục|Cấp xử lý|Mức độ dịch vụ|Đối tượng chính|Thời hạn|Phí\/lệ phí|Lệ phí|Phí|Hồ sơ|Số lượng hồ sơ|Đối tượng|Cơ quan xử lý|Kết quả|Căn cứ pháp lý|Trình tự thực hiện|Cách thức thực hiện|Yêu cầu\/điều kiện thực hiện|Mã thủ tục hành chính quốc gia|Nguồn|Ghi chú):/;

// Gom 17 lĩnh vực thành 4 cụm dễ quét (tầng 1). Key phải khớp category trong catalog.
const TTHC_CLUSTERS = [
    { h: 'Xuất nhập cảnh', cats: [
        { k: 'ho_chieu', icon: 'book_2' },
        { k: 'thi_thuc', icon: 'approval' },
        { k: 'giay_thong_hanh', icon: 'description' },
        { k: 'nguoi_khong_quoc_tich', icon: 'public' },
        { k: 'xuat_nhap_canh', icon: 'flight' },
    ] },
    { h: 'Cư trú', cats: [
        { k: 'cu_tru', icon: 'home' },
        { k: 'tam_tru', icon: 'night_shelter' },
        { k: 'thuong_tru', icon: 'home_pin' },
    ] },
    { h: 'Căn cước & Định danh', cats: [
        { k: 'can_cuoc', icon: 'badge' },
        { k: 'xac_nhan_thong_tin', icon: 'verified_user' },
        { k: 'dinh_danh_dien_tu', icon: 'fingerprint' },
        { k: 'tai_khoan_dien_tu', icon: 'account_circle' },
    ] },
    { h: 'Phương tiện & Khác', cats: [
        { k: 'dang_ky_xe', icon: 'directions_car' },
        { k: 'dac_doanh', icon: 'storefront' },
        { k: 'khieu_nai_to_cao', icon: 'gavel' },
        { k: 'vu_khi', icon: 'security' },
        { k: 'khu_vuc_cam_bien_gioi', icon: 'fence' },
    ] },
];

const TTHC_CAT_ICON = {};
TTHC_CLUSTERS.forEach(c => c.cats.forEach(x => { TTHC_CAT_ICON[x.k] = x.icon; }));

// Chip gợi ý nhanh (tầng 1) — từ khóa phổ biến.
const TTHC_SUGGESTS = ['hộ chiếu', 'tạm trú', 'căn cước', 'đăng ký xe', 'thị thực', 'thường trú'];

let catalogData = null;
let catalogPromise = null;
let catalogIndexData = null;
let catalogIndexPromise = null;
let lastFocusedTrigger = null;
let controlsBuilt = false;
let homeRendered = false;
// Ngữ cảnh danh sách đang xem để nút quay lại từ chi tiết về đúng list.
let listContext = null; // {type:'category', key} | {type:'search', query}
let currentView = 'home';

function getCatalogElements() {
    return {
        launcher: document.getElementById('tthc-catalog-launcher'),
        toggle: document.getElementById('tthc-catalog-toggle-btn'),
        window: document.getElementById('tthc-catalog-window'),
        close: document.getElementById('tthc-catalog-close-btn'),
        back: document.getElementById('tthc-catalog-back-btn'),
        title: document.getElementById('tthc-catalog-title'),
        subtitle: document.getElementById('tthc-catalog-subtitle'),
        status: document.getElementById('tthc-catalog-status'),
        home: document.getElementById('tthc-catalog-home-view'),
        list: document.getElementById('tthc-catalog-list-view'),
        detail: document.getElementById('tthc-catalog-detail-view')
    };
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu.
function normalizeVi(value) {
    return String(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd');
}

// Chuyển '2026-07-01' -> '07/2026' để hiển thị mốc xác minh lệ phí.
function formatVerifiedMonth(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})/);
    return match ? `${match[2]}/${match[1]}` : String(value || '');
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitProcedureLines(text) {
    return String(text || '')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
}

function extractProcedureField(text, label) {
    const pattern = new RegExp(`^(?:[*+]\\s*)?${escapeRegExp(label)}:\\s*(.*)$`, 'i');
    for (const line of splitProcedureLines(text)) {
        const match = line.match(pattern);
        if (match) return match[1].trim();
    }
    return '';
}

function looksCompactSummary(value) {
    return Boolean(value) &&
        value.length <= 120 &&
        !/^(?:[*+]|\d+\.)/.test(value) &&
        !/\.(docx?|pdf|xlsx?)\b/i.test(value) &&
        !/(thành phần hồ sơ|xem chi tiết|chi tiết)/i.test(value);
}

function humanizeFeeValue(fee) {
    const normalized = String(fee || '').trim();
    if (!normalized || normalized === 'Chưa xác minh') {
        return TTHC_FEE_FALLBACK;
    }
    return normalized;
}

// Giữ cho test/back-compat: tóm tắt 4 mục cho người dân từ text thủ tục.
function buildCitizenSummary(proc) {
    const hoSo = extractProcedureField(proc.text, 'Hồ sơ');
    const coQuanXuLy = extractProcedureField(proc.text, 'Cơ quan xử lý');
    const nguon = extractProcedureField(proc.text, 'Nguồn');
    const ketQua = extractProcedureField(proc.text, 'Kết quả');

    return [
        { label: 'Cần chuẩn bị', icon: 'description', value: looksCompactSummary(hoSo) ? hoSo : TTHC_DETAIL_FALLBACK },
        { label: 'Nộp tại', icon: 'location_on', value: looksCompactSummary(coQuanXuLy) ? coQuanXuLy : (looksCompactSummary(nguon) ? nguon : TTHC_DETAIL_FALLBACK) },
        { label: 'Lệ phí / chi phí', icon: 'payments', value: humanizeFeeValue(proc.fee) },
        { label: 'Kết quả', icon: 'task', value: looksCompactSummary(ketQua) ? ketQua : TTHC_DETAIL_FALLBACK },
    ];
}

// Chuẩn hóa nhãn cấp (dọn bug casing "Cấp xã"/"Cấp Xã") -> {short, nopTai, isXa}.
function normalizeCapMeta(capLabel) {
    const raw = normalizeVi(capLabel || '');
    if (raw.includes('trung uong') || raw.includes('cuc') || raw.includes('bo cong an')) {
        return { short: 'Trung ương', nopTai: 'Cục / Bộ Công an (Trung ương)', isXa: false };
    }
    if (raw.includes('tinh')) {
        return { short: 'Tỉnh', nopTai: 'Công an cấp tỉnh (Phú Thọ)', isXa: false };
    }
    if (raw.includes('xa') || raw.includes('phuong')) {
        return { short: 'Xã', nopTai: 'Công an cấp xã', isXa: true };
    }
    return { short: String(capLabel || '').replace(/^Cấp\s*/i, '').trim() || 'Theo quy định', nopTai: String(capLabel || '—'), isXa: false };
}

function truncate(value, max) {
    const s = String(value || '').replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max - 1).trim() + '…' : s;
}

function isTthcModalViewport() {
    return typeof window.matchMedia === 'function' &&
        window.matchMedia(`(max-width: ${TTHC_MODAL_BREAKPOINT}px)`).matches;
}

function isCatalogWindowVisible() {
    return getCatalogElements().window?.classList.contains('tthc-catalog-window--visible');
}

function ensureCatalogLoaded() {
    if (catalogData) return Promise.resolve(catalogData);
    if (!catalogPromise) {
        catalogPromise = fetch('data/tthc-catalog.json')
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(data => {
                catalogData = data;
                return data;
            })
            .catch(err => {
                catalogPromise = null; // cho phép thử lại
                throw err;
            });
    }
    return catalogPromise;
}

function ensureCatalogIndexLoaded() {
    if (catalogIndexData) return Promise.resolve(catalogIndexData);
    if (!catalogIndexPromise) {
        catalogIndexPromise = fetch('data/tthc-index.json')
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(data => {
                catalogIndexData = data;
                return data;
            })
            .catch(err => {
                catalogIndexPromise = null;
                throw err;
            });
    }
    return catalogIndexPromise;
}

// Ẩn cả 3 view và hiện status (loading/error). status='' -> ẩn status, hiện lại view hiện tại.
function setStatus(html) {
    const { status, home, list, detail } = getCatalogElements();
    if (!status) return;
    if (html) {
        status.innerHTML = html;
        status.hidden = false;
        if (home) home.hidden = true;
        if (list) list.hidden = true;
        if (detail) detail.hidden = true;
    } else {
        status.hidden = true;
        status.innerHTML = '';
    }
}

function categoryCount(key) {
    if (!catalogData) return 0;
    const cat = (catalogData.categories || []).find(c => c.key === key);
    if (cat) return cat.count;
    return catalogData.procedures.filter(p => p.category === key).length;
}

function categoryLabel(key) {
    if (!catalogData) return key;
    const cat = (catalogData.categories || []).find(c => c.key === key);
    if (cat) return cat.label;
    const proc = catalogData.procedures.find(p => p.category === key);
    return proc ? proc.categoryLabel : key;
}

// ---- Tầng 1: home (search-first + lưới lĩnh vực) ----
function renderHome() {
    const { home } = getCatalogElements();
    if (!home || !catalogData) return;

    const total = catalogData.procedures.length;
    const suggests = TTHC_SUGGESTS.map(s =>
        `<button class="tthc-suggest" type="button" data-q="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('');

    // Các category có trong dữ liệu nhưng chưa nằm trong cụm nào -> dồn vào cụm cuối.
    const known = new Set();
    TTHC_CLUSTERS.forEach(c => c.cats.forEach(x => known.add(x.k)));
    const extraKeys = (catalogData.categories || [])
        .map(c => c.key).filter(k => !known.has(k));

    const clustersHtml = TTHC_CLUSTERS.map((cl, ci) => {
        const cats = cl.cats.slice();
        if (ci === TTHC_CLUSTERS.length - 1) {
            extraKeys.forEach(k => cats.push({ k, icon: 'folder' }));
        }
        const tiles = cats
            .filter(c => categoryCount(c.k) > 0)
            .map(c => {
                const n = categoryCount(c.k);
                return `<button class="tthc-tile" type="button" data-cat="${escapeHtml(c.k)}">` +
                    `<span class="tthc-tile-ic"><span class="material-symbols-outlined" aria-hidden="true">${c.icon}</span></span>` +
                    `<span class="tthc-tile-body">` +
                    `<span class="tthc-tile-name">${escapeHtml(categoryLabel(c.k))}</span>` +
                    `<span class="tthc-tile-count">${n} thủ tục</span>` +
                    `</span></button>`;
            }).join('');
        if (!tiles) return '';
        return `<div class="tthc-cluster"><div class="tthc-cluster-h">${escapeHtml(cl.h)}</div>` +
            `<div class="tthc-tile-grid">${tiles}</div></div>`;
    }).join('');

    home.innerHTML =
        `<div class="tthc-hero">` +
        `<h2 class="tthc-hero-title">Bạn cần làm thủ tục gì?</h2>` +
        `<p class="tthc-hero-sub">Tra theo tên, hoặc chọn lĩnh vực bên dưới. ${total} thủ tục thuộc thẩm quyền Công an.</p>` +
        `<form class="tthc-search" id="tthc-catalog-search-form" role="search">` +
        `<span class="material-symbols-outlined" aria-hidden="true">search</span>` +
        `<label for="tthc-catalog-search" class="sr-only">Tìm theo tên thủ tục</label>` +
        `<input type="search" id="tthc-catalog-search" autocomplete="off" placeholder="Nhập: hộ chiếu, tạm trú, căn cước, đăng ký xe…">` +
        `<button class="tthc-search-submit" type="submit" aria-label="Tìm thủ tục">` +
        `<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>` +
        `</form>` +
        `<div class="tthc-suggests">${suggests}</div>` +
        `</div>` +
        clustersHtml;
}

function filterByCategory(key) {
    return catalogData.procedures.filter(p => p.category === key);
}

function filterBySearch(query) {
    const q = normalizeVi(query.trim());
    if (!q) return [];
    return catalogData.procedures.filter(p => normalizeVi(p.title).includes(q));
}

// ---- Tầng 2: danh sách thủ tục (phẳng, chia dòng) ----
function renderProcedureRows(procedures) {
    if (!procedures.length) {
        return '<li class="tthc-empty">' +
            '<span class="material-symbols-outlined" aria-hidden="true">search_off</span>' +
            '<p>Chưa tìm thấy thủ tục phù hợp. Thử từ khóa ngắn hơn như "hộ chiếu", "tạm trú", "căn cước".</p></li>';
    }
    return procedures.map(proc => {
        const cap = normalizeCapMeta(proc.capLabel);
        return `<li class="result-list-item">` +
            `<button class="tthc-row" type="button" data-procedure-id="${escapeHtml(proc.procedureId)}">` +
            `<span class="tthc-row-body">` +
            `<span class="tthc-row-title">${escapeHtml(proc.title)}</span>` +
            `<span class="tthc-row-meta"><span class="tthc-cap${cap.isXa ? ' is-xa' : ''}">` +
            `<span class="material-symbols-outlined" aria-hidden="true">apartment</span>Nộp tại: ${escapeHtml(cap.nopTai)}</span></span>` +
            `</span>` +
            `<span class="material-symbols-outlined tthc-row-arrow" aria-hidden="true">chevron_right</span>` +
            `</button></li>`;
    }).join('');
}

function renderListView(context) {
    const { list } = getCatalogElements();
    if (!list) return;
    listContext = context;
    let procedures;
    let heading;
    let subtitle;
    if (context.type === 'search') {
        procedures = filterBySearch(context.query);
        heading = `Kết quả cho “${escapeHtml(context.query)}”`;
        subtitle = `${procedures.length} thủ tục`;
    } else {
        procedures = filterByCategory(context.key);
        heading = escapeHtml(categoryLabel(context.key));
        subtitle = `${procedures.length} thủ tục`;
    }
    list.innerHTML =
        `<div class="tthc-list-head"><h2>${heading}</h2><span>${subtitle}</span></div>` +
        `<ul class="result-list" id="tthc-catalog-list" aria-label="Danh sách thủ tục hành chính">${renderProcedureRows(procedures)}</ul>`;
    list.scrollTop = 0;
}

// ---- Tầng 3: chi tiết (tóm tắt + note phí + accordion) ----
// Nhận diện đầu mục theo 2 định dạng: nhãn TTHC chuẩn ("Hồ sơ:") và nhãn wiki
// đánh số của guide ("15.1. Trình tự thực hiện:") — guide chiếm ~62% catalog.
const TTHC_NUM_HEAD_RE = /^(\d+(?:\.\d+)*)\.\s+(.+?):\s*(.*)$/;

function parseProcedureSections(text) {
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    const sections = [];
    let cur = null;
    for (const line of lines) {
        let label = null;
        let rest = '';
        const mT = line.match(TTHC_LABEL_RE);
        const mN = line.match(TTHC_NUM_HEAD_RE);
        if (mT) {
            label = mT[2];
            rest = line.slice(mT[0].length).replace(/^\s+/, '');
        } else if (mN) {
            label = mN[2].trim();
            rest = (mN[3] || '').trim();
        }
        if (label !== null) {
            cur = { label, body: rest ? [rest] : [] };
            sections.push(cur);
        } else if (cur) {
            cur.body.push(line);
        } else if (line.trim()) {
            cur = { label: '__pre', body: [line] };
            sections.push(cur);
        }
    }
    return sections.map(s => ({ label: s.label, body: s.body.join('\n').trim() })).filter(s => s.body);
}

// Phân loại một mục vào nhóm accordion theo từ khóa (khớp cả tthc lẫn guide).
function classifySection(label) {
    const l = normalizeVi(label);
    if (/^(ten thu tuc|loai thu tuc|cap xu ly|muc do|doi tuong chinh|nguon$|noi dung$|thu tuc$|ma thu tuc|le phi$|^phi$|phi\/le phi)/.test(l)) return 'meta';
    if (/(can cu|phap ly)/.test(l)) return 'cancu';
    if (/(ho so|thanh phan|mau don|mau to khai|to khai)/.test(l)) return 'hoso';
    if (/(trinh tu|cach thuc)/.test(l)) return 'trinhtu';
    if (/(yeu cau|dieu kien)/.test(l)) return 'yeucau';
    return 'khac';
}

const TTHC_ACC_ORDER = [
    { key: 'hoso', title: 'Hồ sơ cần chuẩn bị', icon: 'description' },
    { key: 'trinhtu', title: 'Trình tự thực hiện', icon: 'format_list_numbered' },
    { key: 'yeucau', title: 'Yêu cầu, đối tượng', icon: 'checklist' },
    { key: 'cancu', title: 'Căn cứ pháp lý', icon: 'gavel' },
    { key: 'khac', title: 'Thông tin khác', icon: 'more_horiz' },
];

function buildAccordions(text) {
    const sections = parseProcedureSections(text);
    const groups = {};
    sections.forEach(s => {
        const g = classifySection(s.label);
        if (g === 'meta') return;
        const line = s.label === '__pre' ? s.body : `${s.label}:\n${s.body}`;
        (groups[g] = groups[g] || []).push(line);
    });
    return TTHC_ACC_ORDER
        .filter(o => groups[o.key] && groups[o.key].join('').trim())
        .map(o => ({ title: o.title, icon: o.icon, body: groups[o.key].join('\n\n').trim() }));
}

// Lấy giá trị tóm tắt từ mục có nhãn chứa từ khóa (khớp cả "Thời hạn giải quyết" của guide).
function summaryFieldFromSections(sections, keyword) {
    const kw = normalizeVi(keyword);
    const sec = sections.find(s => normalizeVi(s.label).includes(kw));
    if (!sec) return '';
    const first = String(sec.body).split('\n').map(x => x.trim()).filter(Boolean)[0] || '';
    return /xem chi tiet|xem noi dung|dang cap nhat/i.test(normalizeVi(first)) ? '' : first;
}

function buildSummaryChips(proc) {
    const cap = normalizeCapMeta(proc.capLabel);
    const sections = parseProcedureSections(proc.text);
    const thoiHan = summaryFieldFromSections(sections, 'thoi han');
    const ketQua = summaryFieldFromSections(sections, 'ket qua');
    return [
        { icon: 'apartment', label: 'Nộp tại', value: cap.nopTai },
        { icon: 'layers', label: 'Cấp thực hiện', value: cap.short },
        { icon: 'schedule', label: 'Thời hạn', value: thoiHan ? truncate(thoiHan, 80) : 'Theo quy định từng bước' },
        { icon: 'task_alt', label: 'Kết quả', value: ketQua ? truncate(ketQua, 80) : 'Giấy tờ / kết quả tương ứng' },
    ];
}

function renderDetailView(proc) {
    const { detail } = getCatalogElements();
    if (!detail) return;
    const feeUnverified = !proc.fee || proc.fee === 'Chưa xác minh';
    const summary = buildSummaryChips(proc);
    const accs = buildAccordions(proc.text);

    const summaryHtml = summary.map(s =>
        `<div class="tthc-sum"><span class="material-symbols-outlined" aria-hidden="true">${s.icon}</span>` +
        `<div><span class="tthc-sum-label">${escapeHtml(s.label)}</span>` +
        `<span class="tthc-sum-value">${escapeHtml(s.value)}</span></div></div>`).join('');

    const feeHtml = feeUnverified
        ? `<div class="tthc-fee-note"><span class="material-symbols-outlined" aria-hidden="true">info</span>` +
          `<span>Liên hệ trực tiếp cơ quan tiếp nhận hoặc tra văn bản gốc để biết lệ phí chính xác.</span></div>`
        : `<div class="tthc-fee-note is-known"><span class="material-symbols-outlined" aria-hidden="true">payments</span>` +
          `<span><strong>Lệ phí / chi phí:</strong> ${escapeHtml(proc.fee)}</span></div>`;

    const accHtml = accs.map((a, i) =>
        `<details class="tthc-acc"${i === 0 ? ' open' : ''}>` +
        `<summary><span class="tthc-acc-title"><span class="material-symbols-outlined" aria-hidden="true">${a.icon}</span>${escapeHtml(a.title)}</span></summary>` +
        `<div class="tthc-acc-body">${formatProcedureText(a.body)}</div></details>`).join('');

    const sourceHtml = proc.sourceDecision
        ? `<p class="tthc-detail-source">Nguồn: ${escapeHtml(proc.sourceDecision)}</p>` : '';

    detail.innerHTML =
        `<h2 class="tthc-detail-title">${escapeHtml(proc.title)}</h2>` +
        `<div class="tthc-summary-grid">${summaryHtml}</div>` +
        feeHtml +
        (accHtml || `<div class="tthc-acc-body">${formatProcedureText(proc.text)}</div>`) +
        sourceHtml;
    detail.scrollTop = 0;
}

// In đậm nhãn đầu dòng, giữ nguyên văn phần còn lại (escape trước, bold sau).
function formatProcedureText(text) {
    return String(text).split('\n').map(line => {
        const safe = escapeHtml(line);
        const match = safe.match(TTHC_LABEL_RE);
        if (match) {
            const end = match[0].length; // gồm cả dấu ':'
            return `<strong class="tthc-detail-label">${safe.slice(0, end)}</strong>${safe.slice(end)}`;
        }
        return safe;
    }).join('\n');
}

// ---- Điều hướng view ----
function showHomeView() {
    const { home, list, detail, back, title, subtitle } = getCatalogElements();
    setStatus('');
    currentView = 'home';
    listContext = null;
    if (home) home.hidden = false;
    if (list) list.hidden = true;
    if (detail) { detail.hidden = true; detail.innerHTML = ''; }
    if (back) back.hidden = true;
    if (title) title.textContent = 'Danh mục thủ tục hành chính';
    if (subtitle) subtitle.textContent = 'Chọn lĩnh vực bạn cần';
}

function showListView(context, statusNotice) {
    const { home, list, detail, back, title, subtitle } = getCatalogElements();
    setStatus('');
    currentView = 'list';
    renderListView(context);
    if (home) home.hidden = true;
    if (list) list.hidden = false;
    if (detail) { detail.hidden = true; detail.innerHTML = ''; }
    if (back) back.hidden = false;
    if (title) title.textContent = context.type === 'search' ? 'Kết quả tìm kiếm' : 'Danh sách thủ tục';
    if (subtitle) subtitle.textContent = statusNotice || (context.type === 'category' ? categoryLabel(context.key) : `“${context.query}”`);
}

function showDetailView(proc) {
    const { home, list, detail, back, title, subtitle } = getCatalogElements();
    setStatus('');
    currentView = 'detail';
    renderDetailView(proc);
    if (home) home.hidden = true;
    if (list) list.hidden = true;
    if (detail) detail.hidden = false;
    if (back) back.hidden = false;
    if (title) title.textContent = 'Chi tiết thủ tục';
    if (subtitle) subtitle.textContent = truncate(proc.title, 60);
}

function goToProcedure(procedureId, { resetContext = false } = {}) {
    const proc = catalogData && catalogData.procedures.find(p => p.procedureId === procedureId);
    if (proc) {
        // Deep-link ngoài catalog phải thay context cũ; click từ list hiện tại thì giữ nguyên context.
        if (resetContext || !listContext) listContext = { type: 'category', key: proc.category };
        showDetailView(proc);
    } else {
        // Deep-link tới thủ tục không có trong danh mục -> về home (không mở nhầm).
        showHomeView();
    }
}

function goBack() {
    if (currentView === 'detail') {
        if (listContext) showListView(listContext);
        else showHomeView();
    } else if (currentView === 'list') {
        showHomeView();
    }
}

function renderError() {
    setStatus(
        '<div class="error-state">' +
        '<p>Không tải được danh mục thủ tục.</p>' +
        '<button type="button" class="data-retry-btn" id="tthc-catalog-retry">Thử lại</button>' +
        '</div>'
    );
    document.getElementById('tthc-catalog-retry')?.addEventListener('click', () => {
        loadAndRender(pendingProcedureId);
    });
}

let pendingProcedureId = null;

function loadAndRender(procedureId) {
    pendingProcedureId = procedureId || null;
    setStatus('<div class="loading-state">Đang tải danh mục...</div>');
    ensureCatalogLoaded()
        .then(() => {
            setStatus('');
            if (!homeRendered) { renderHome(); homeRendered = true; }
            if (!controlsBuilt) buildControls();
            if (procedureId) goToProcedure(procedureId, { resetContext: true });
            else showHomeView();
        })
        .catch(() => renderError());
}

// Đóng cửa sổ chat nếu đang mở (chat và catalog dùng chung góc màn hình, loại trừ lẫn nhau).
function closeChatIfOpen() {
    const chatWindow = document.getElementById('ai-chat-window');
    if (chatWindow?.classList.contains('ai-chat-window--visible')) {
        window.ChatbotUI?.close?.({ restoreFocus: false });
    }
}

function syncCatalogPresentation(isOpen) {
    const { window: catalogWindow } = getCatalogElements();
    if (!catalogWindow) return;
    catalogWindow.setAttribute('aria-modal', 'false');
    document.body.classList.toggle('tthc-catalog-modal-open', isOpen && isTthcModalViewport());
}

function openCatalogWindow(procedureId) {
    const { toggle, window: catalogWindow } = getCatalogElements();
    if (!catalogWindow) return;
    lastFocusedTrigger = (document.activeElement instanceof HTMLElement) ? document.activeElement : toggle;

    closeChatIfOpen();

    catalogWindow.classList.remove('tthc-catalog-window--hidden');
    catalogWindow.classList.add('tthc-catalog-window--visible');
    catalogWindow.setAttribute('aria-hidden', 'false');
    toggle?.setAttribute('aria-expanded', 'true');
    document.body.classList.add('tthc-catalog-open');
    syncCatalogPresentation(true);

    loadAndRender(procedureId);
    setTimeout(() => getCatalogElements().close?.focus(), 120);
}

function closeCatalogWindow({ restoreFocus = true } = {}) {
    const { toggle, window: catalogWindow } = getCatalogElements();
    if (!catalogWindow) return;
    const wasVisible = isCatalogWindowVisible();
    catalogWindow.classList.remove('tthc-catalog-window--visible');
    catalogWindow.classList.add('tthc-catalog-window--hidden');
    catalogWindow.setAttribute('aria-hidden', 'true');
    toggle?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('tthc-catalog-open');
    syncCatalogPresentation(false);
    if (!restoreFocus || !wasVisible) return;
    if (lastFocusedTrigger && document.contains(lastFocusedTrigger) && lastFocusedTrigger.offsetParent !== null) {
        lastFocusedTrigger.focus();
    } else if (toggle?.offsetParent !== null) toggle.focus();
}

function isDetailViewOpen() {
    return currentView === 'detail';
}

// Gắn listener 1 lần (event delegation) cho home (search/suggest/tile) + list (row).
function buildControls() {
    const { home, list } = getCatalogElements();
    if (home) {
        home.addEventListener('submit', event => {
            if (event.target && event.target.id === 'tthc-catalog-search-form') {
                event.preventDefault();
                const search = event.target.querySelector('#tthc-catalog-search');
                const q = search ? search.value.trim() : '';
                if (q) showListView({ type: 'search', query: q });
            }
        });
        home.addEventListener('click', event => {
            const tile = event.target.closest('.tthc-tile');
            if (tile) { showListView({ type: 'category', key: tile.dataset.cat }); return; }
            const sug = event.target.closest('.tthc-suggest');
            if (sug) { showListView({ type: 'search', query: sug.dataset.q }); }
        });
    }
    if (list) {
        list.addEventListener('click', event => {
            const row = event.target.closest('.tthc-row');
            if (row) goToProcedure(row.dataset.procedureId);
        });
    }
    controlsBuilt = true;
}

function initTthcCatalog() {
    const { toggle, close, back, window: catalogWindow } = getCatalogElements();
    if (!toggle || !catalogWindow) return;

    toggle.addEventListener('click', event => {
        event.stopPropagation();
        if (window.AppNavigation?.isMobile?.()) {
            window.AppNavigation.activate(isCatalogWindowVisible() ? 'map' : 'procedures');
        } else if (isCatalogWindowVisible()) closeCatalogWindow();
        else openCatalogWindow();
    });

    close?.addEventListener('click', event => {
        event.stopPropagation();
        if (window.AppNavigation?.isMobile?.()) window.AppNavigation.activate('map');
        else closeCatalogWindow();
    });

    back?.addEventListener('click', event => {
        event.stopPropagation();
        goBack();
    });

    catalogWindow.addEventListener('click', event => event.stopPropagation());
    catalogWindow.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            if (currentView === 'detail' || currentView === 'list') goBack();
            else if (window.AppNavigation?.isMobile?.()) window.AppNavigation.activate('map');
            else closeCatalogWindow();
        }
    });

    window.addEventListener('resize', () => {
        if (isCatalogWindowVisible()) syncCatalogPresentation(true);
    });

    window.AppNavigation?.registerSurface('procedures', {
        activate: payload => {
            if (payload?.title) openCatalogByTitleDirect(payload.title);
            else openCatalogWindow(payload?.procedureId);
        },
        deactivate: () => closeCatalogWindow({ restoreFocus: false })
    });

    // Ẩn nút mở catalog khi cửa sổ chat đang mở (tránh đè lên nhau ở góc dưới-trái).
    const chatWindow = document.getElementById('ai-chat-window');
    if (chatWindow && typeof MutationObserver === 'function') {
        const observer = new MutationObserver(() => {
            const chatOpen = chatWindow.classList.contains('ai-chat-window--visible');
            document.body.classList.toggle('ai-chat-open', chatOpen);
        });
        observer.observe(chatWindow, { attributes: true, attributeFilter: ['class'] });
    }
}

// P3.3: Tra procedureId theo title khớp CHÍNH XÁC (đã chuẩn hóa). Cho phép
// citation guide trong chat (không có procedure_id runtime) deep-link tới danh
// mục qua tiêu đề. Khớp chính xác để KHÔNG bao giờ mở nhầm thủ tục.
function resolveProcedureIdFromList(procedures, procedureId, title) {
    const items = Array.isArray(procedures) ? procedures : [];
    const requestedId = String(procedureId || '').trim();
    if (requestedId) {
        const exact = items.find(item => String(item.procedure_id || item.procedureId || '').trim() === requestedId);
        if (exact) return exact.procedure_id || exact.procedureId;
    }

    const target = normalizeVi(title || '').trim();
    if (!target) return null;
    const proc = items.find(item => {
        if (normalizeVi(item.title || '').trim() === target) return true;
        return (item.aliases || []).some(alias => normalizeVi(alias).trim() === target);
    });
    return proc ? (proc.procedure_id || proc.procedureId) : null;
}

function resolveProcedureId(procedureId, title) {
    const procedures = catalogIndexData?.procedures || catalogData?.procedures || [];
    return resolveProcedureIdFromList(procedures, procedureId, title);
}

function findProcedureIdByTitle(title) {
    return resolveProcedureId('', title);
}

// Mở danh mục và điều hướng theo title (lazy-load như openProcedure). Không khớp
// chính xác thì về home kèm thông báo — không mở nhầm thủ tục.
function openCatalogByTitleDirect(title) {
    openCatalogWindow();
    ensureCatalogLoaded().then(() => {
        const id = findProcedureIdByTitle(title);
        if (id) goToProcedure(id, { resetContext: true });
        else showHomeView();
    }).catch(() => {});
}

function openCatalogByTitle(title) {
    if (window.AppNavigation?.isMobile?.()) {
        window.AppNavigation.activate('procedures', { title });
        return;
    }
    openCatalogByTitleDirect(title);
}

if (typeof window !== 'undefined') {
    window.TthcCatalog = {
        open: () => window.AppNavigation?.isMobile?.()
            ? window.AppNavigation.activate('procedures')
            : openCatalogWindow(),
        openProcedure: procedureId => window.AppNavigation?.isMobile?.()
            ? window.AppNavigation.activate('procedures', { procedureId })
            : openCatalogWindow(procedureId),
        openByTitle: openCatalogByTitle,
        findByTitle: findProcedureIdByTitle,
        resolveProcedureId,
        // Chat chỉ warm index nhỏ; catalog toàn văn chỉ tải khi người dùng thực sự mở danh mục.
        preload: () => ensureCatalogIndexLoaded(),
        close: closeCatalogWindow
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports.__test = {
        normalizeVi,
        formatVerifiedMonth,
        extractProcedureField,
        buildCitizenSummary,
        humanizeFeeValue,
        formatProcedureText,
        escapeHtml,
        normalizeCapMeta,
        parseProcedureSections,
        buildAccordions,
        buildSummaryChips,
        TTHC_LABEL_RE,
        TTHC_DETAIL_FALLBACK,
        TTHC_FEE_FALLBACK,
        resolveProcedureIdFromList
    };
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initTthcCatalog);
    else initTthcCatalog();
}
