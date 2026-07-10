// Danh mục thủ tục hành chính (TTHC) — panel duyệt + xem toàn văn để đối chiếu câu trả lời AI.
// Dữ liệu tĩnh từ data/tthc-catalog.json (sinh bởi scripts/generate-tthc-catalog.js).
// Public API: window.TthcCatalog.open() / openProcedure(procedureId) / close().

const TTHC_MODAL_BREAKPOINT = 768;
const TTHC_DETAIL_FALLBACK = 'Xem nội dung chi tiết bên dưới.';
const TTHC_FEE_FALLBACK = 'Chưa có thông tin chắc chắn trong dữ liệu hiện có.';

// Tập nhãn đóng trong trường text của mỗi thủ tục — dùng để in đậm đầu dòng, giữ nội dung nguyên văn.
const TTHC_LABEL_RE = /^([*+]\s*)?(Tên thủ tục|Loại thủ tục|Cấp xử lý|Mức độ dịch vụ|Đối tượng chính|Thời hạn|Phí\/lệ phí|Lệ phí|Phí|Hồ sơ|Số lượng hồ sơ|Đối tượng|Cơ quan xử lý|Kết quả|Căn cứ pháp lý|Trình tự thực hiện|Cách thức thực hiện|Yêu cầu\/điều kiện thực hiện|Mã thủ tục hành chính quốc gia|Nguồn|Ghi chú):/;

let catalogData = null;
let catalogPromise = null;
let activeCategory = 'all';
let searchQuery = '';
let lastFocusedTrigger = null;
let controlsBuilt = false;

function getCatalogElements() {
    return {
        launcher: document.getElementById('tthc-catalog-launcher'),
        toggle: document.getElementById('tthc-catalog-toggle-btn'),
        window: document.getElementById('tthc-catalog-window'),
        close: document.getElementById('tthc-catalog-close-btn'),
        back: document.getElementById('tthc-catalog-back-btn'),
        listView: document.getElementById('tthc-catalog-list-view'),
        detailView: document.getElementById('tthc-catalog-detail-view'),
        controls: document.getElementById('tthc-catalog-controls'),
        search: document.getElementById('tthc-catalog-search'),
        chips: document.getElementById('tthc-catalog-chips'),
        status: document.getElementById('tthc-catalog-status'),
        list: document.getElementById('tthc-catalog-list')
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

function buildCitizenSummary(proc) {
    const hoSo = extractProcedureField(proc.text, 'Hồ sơ');
    const coQuanXuLy = extractProcedureField(proc.text, 'Cơ quan xử lý');
    const nguon = extractProcedureField(proc.text, 'Nguồn');
    const ketQua = extractProcedureField(proc.text, 'Kết quả');

    return [
        {
            label: 'Cần chuẩn bị',
            icon: 'description',
            value: looksCompactSummary(hoSo) ? hoSo : TTHC_DETAIL_FALLBACK,
        },
        {
            label: 'Nộp tại',
            icon: 'location_on',
            value: looksCompactSummary(coQuanXuLy) ? coQuanXuLy : (looksCompactSummary(nguon) ? nguon : TTHC_DETAIL_FALLBACK),
        },
        {
            label: 'Lệ phí / chi phí',
            icon: 'payments',
            value: humanizeFeeValue(proc.fee),
        },
        {
            label: 'Kết quả',
            icon: 'task',
            value: looksCompactSummary(ketQua) ? ketQua : TTHC_DETAIL_FALLBACK,
        },
    ];
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

function setStatus(html) {
    const { status, controls, list } = getCatalogElements();
    if (!status) return;
    if (html) {
        status.innerHTML = html;
        status.hidden = false;
        if (controls) controls.hidden = true;
        if (list) list.innerHTML = '';
    } else {
        status.hidden = true;
        status.innerHTML = '';
        if (controls) controls.hidden = false;
    }
}

function filteredProcedures() {
    if (!catalogData) return [];
    const q = normalizeVi(searchQuery.trim());
    return catalogData.procedures.filter(proc => {
        if (activeCategory !== 'all' && proc.category !== activeCategory) return false;
        if (q && !normalizeVi(proc.title).includes(q)) return false;
        return true;
    });
}

function renderChips() {
    const { chips } = getCatalogElements();
    if (!chips || !catalogData) return;
    const total = catalogData.procedures.length;
    const items = [{ key: 'all', label: 'Tất cả', count: total }, ...catalogData.categories];
    chips.innerHTML = items.map(cat => {
        const selected = cat.key === activeCategory;
        return `<button class="tthc-chip${selected ? ' is-active' : ''}" role="tab" type="button"` +
            ` data-category="${escapeHtml(cat.key)}" aria-selected="${selected}">` +
            `${escapeHtml(cat.label)}<span class="tthc-chip-count">${cat.count}</span></button>`;
    }).join('');
}

function renderListItems() {
    const { list } = getCatalogElements();
    if (!list) return;
    const procedures = filteredProcedures();

    if (procedures.length === 0) {
        list.innerHTML = '<li class="tthc-empty">' +
            '<span class="material-symbols-outlined" aria-hidden="true">search_off</span>' +
            '<p>Chưa tìm thấy thủ tục phù hợp. Thử từ khóa ngắn hơn như "hộ chiếu", "tạm trú", "căn cước".</p></li>';
        return;
    }

    list.innerHTML = procedures.map(proc => {
        const feeUnverified = proc.fee === 'Chưa xác minh';
        return `<li class="result-list-item">` +
            `<button class="result-item tthc-card" type="button" data-procedure-id="${escapeHtml(proc.procedureId)}">` +
            `<div class="tthc-card-body">` +
            `<h3 class="tthc-card-title">${escapeHtml(proc.title)}</h3>` +
            `<div class="tthc-card-badges">` +
            `<span class="tthc-badge tthc-badge--cat">${escapeHtml(proc.categoryLabel)}</span>` +
            `<span class="tthc-badge tthc-badge--cap">${escapeHtml(proc.capLabel)}</span>` +
            `</div>` +
            `<p class="tthc-card-fee${feeUnverified ? ' is-unverified' : ''}">` +
            `<span class="material-symbols-outlined" aria-hidden="true">payments</span>` +
            `${escapeHtml(proc.fee)}</p>` +
            `</div>` +
            `<span class="material-symbols-outlined tthc-card-arrow" aria-hidden="true">chevron_right</span>` +
            `</button></li>`;
    }).join('');
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

function renderCatalogDetail(proc) {
    const { detailView } = getCatalogElements();
    if (!detailView) return;
    const feeUnverified = proc.fee === 'Chưa xác minh';
    const citizenSummary = buildCitizenSummary(proc);

    detailView.innerHTML =
        `<h2 class="tthc-detail-title">${escapeHtml(proc.title)}</h2>` +
        `<div class="tthc-card-badges tthc-detail-badges">` +
        `<span class="tthc-badge tthc-badge--cat">${escapeHtml(proc.categoryLabel)}</span>` +
        `<span class="tthc-badge tthc-badge--cap">${escapeHtml(proc.capLabel)}</span>` +
        `</div>` +
        `<section class="tthc-citizen-summary" aria-label="Tóm tắt nhanh">` +
        `<h3 class="tthc-citizen-summary-title">Tóm tắt nhanh</h3>` +
        `<div class="tthc-citizen-summary-grid">` +
        citizenSummary.map(item =>
            `<article class="tthc-citizen-summary-item">` +
            `<span class="material-symbols-outlined" aria-hidden="true">${item.icon}</span>` +
            `<div>` +
            `<span class="tthc-citizen-summary-label">${escapeHtml(item.label)}</span>` +
            `<span class="tthc-citizen-summary-value">${escapeHtml(item.value)}</span>` +
            `</div>` +
            `</article>`
        ).join('') +
        `</div>` +
        `</section>` +
        `<div class="tthc-inforow${feeUnverified ? ' tthc-inforow--warn' : ''}">` +
        `<span class="material-symbols-outlined" aria-hidden="true">payments</span>` +
        `<div><span class="tthc-inforow-label">Lệ phí / chi phí</span>` +
        `<span class="tthc-inforow-value">${escapeHtml(humanizeFeeValue(proc.fee))}</span></div></div>` +
        `<div class="tthc-inforow">` +
        `<span class="material-symbols-outlined" aria-hidden="true">gavel</span>` +
        `<div><span class="tthc-inforow-label">Nguồn dữ liệu</span>` +
        `<span class="tthc-inforow-value">${escapeHtml(proc.sourceDecision || '—')}</span></div></div>` +
        `<div class="tthc-detail-text">${formatProcedureText(proc.text)}</div>`;
}

function showListView(statusNotice) {
    const { listView, detailView, back, title } = getCatalogElements();
    if (listView) listView.hidden = false;
    if (detailView) {
        detailView.hidden = true;
        detailView.innerHTML = '';
    }
    if (back) back.hidden = true;
    const titleEl = document.getElementById('tthc-catalog-title');
    if (titleEl) titleEl.textContent = 'Danh mục thủ tục hành chính';
    renderChips();
    renderListItems();
    if (statusNotice) {
        const { status } = getCatalogElements();
        if (status) {
            status.innerHTML = `<p class="tthc-status-notice">${escapeHtml(statusNotice)}</p>`;
            status.hidden = false;
        }
    } else {
        const { status } = getCatalogElements();
        if (status) status.hidden = true;
    }
}

function showDetailView(proc) {
    const { listView, detailView, back } = getCatalogElements();
    renderCatalogDetail(proc);
    if (listView) listView.hidden = true;
    if (detailView) detailView.hidden = false;
    if (back) back.hidden = false;
    const titleEl = document.getElementById('tthc-catalog-title');
    if (titleEl) titleEl.textContent = 'Chi tiết thủ tục';
    if (detailView) detailView.scrollTop = 0;
}

function goToProcedure(procedureId) {
    const proc = catalogData && catalogData.procedures.find(p => p.procedureId === procedureId);
    if (proc) {
        showDetailView(proc);
    } else {
        showListView('Thủ tục này chưa có trong danh mục đối chiếu.');
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
        const target = pendingProcedureId;
        loadAndRender(target);
    });
}

let pendingProcedureId = null;

function loadAndRender(procedureId) {
    pendingProcedureId = procedureId || null;
    setStatus('<div class="loading-state">Đang tải danh mục...</div>');
    ensureCatalogLoaded()
        .then(() => {
            setStatus('');
            if (!controlsBuilt) buildControls();
            if (procedureId) goToProcedure(procedureId);
            else showListView();
        })
        .catch(() => renderError());
}

// Đóng cửa sổ chat nếu đang mở (chat và catalog dùng chung góc màn hình, loại trừ lẫn nhau).
function closeChatIfOpen() {
    const chatWindow = document.getElementById('ai-chat-window');
    const chatToggle = document.getElementById('ai-chat-toggle-btn');
    if (chatWindow?.classList.contains('ai-chat-window--visible')) {
        chatToggle?.click(); // dùng toggle để chatbot.js tự dọn state
    }
}

function syncCatalogPresentation(isOpen) {
    const { window: catalogWindow } = getCatalogElements();
    if (!catalogWindow) return;
    const isModal = isOpen && isTthcModalViewport();
    catalogWindow.setAttribute('aria-modal', isModal ? 'true' : 'false');
    document.body.classList.toggle('tthc-catalog-modal-open', isModal);
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

function closeCatalogWindow() {
    const { toggle, window: catalogWindow } = getCatalogElements();
    if (!catalogWindow) return;
    catalogWindow.classList.remove('tthc-catalog-window--visible');
    catalogWindow.classList.add('tthc-catalog-window--hidden');
    catalogWindow.setAttribute('aria-hidden', 'true');
    toggle?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('tthc-catalog-open');
    syncCatalogPresentation(false);
    if (lastFocusedTrigger && document.contains(lastFocusedTrigger)) lastFocusedTrigger.focus();
    else toggle?.focus();
}

function isDetailViewOpen() {
    const { detailView } = getCatalogElements();
    return detailView && !detailView.hidden;
}

// Gắn listener 1 lần cho search + chips + list (event delegation).
function buildControls() {
    const { search, chips, list } = getCatalogElements();
    if (search) {
        search.addEventListener('input', () => {
            searchQuery = search.value;
            const { status } = getCatalogElements();
            if (status) status.hidden = true;
            renderListItems();
        });
    }
    if (chips) {
        chips.addEventListener('click', event => {
            const btn = event.target.closest('.tthc-chip');
            if (!btn) return;
            activeCategory = btn.dataset.category || 'all';
            renderChips();
            renderListItems();
        });
    }
    if (list) {
        list.addEventListener('click', event => {
            const card = event.target.closest('.tthc-card');
            if (!card) return;
            goToProcedure(card.dataset.procedureId);
        });
    }
    controlsBuilt = true;
}

function initTthcCatalog() {
    const { toggle, close, back, window: catalogWindow } = getCatalogElements();
    if (!toggle || !catalogWindow) return;

    toggle.addEventListener('click', event => {
        event.stopPropagation();
        if (isCatalogWindowVisible()) closeCatalogWindow();
        else openCatalogWindow();
    });

    close?.addEventListener('click', event => {
        event.stopPropagation();
        closeCatalogWindow();
    });

    back?.addEventListener('click', event => {
        event.stopPropagation();
        showListView();
    });

    catalogWindow.addEventListener('click', event => event.stopPropagation());
    catalogWindow.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            if (isDetailViewOpen()) showListView();
            else closeCatalogWindow();
            return;
        }
        if (event.key === 'Tab' && isTthcModalViewport()) {
            const focusable = Array.from(catalogWindow.querySelectorAll(
                'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )).filter(el => el.offsetParent !== null && !el.hidden);
            if (focusable.length < 2) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    });

    window.addEventListener('resize', () => {
        if (isCatalogWindowVisible()) syncCatalogPresentation(true);
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

if (typeof window !== 'undefined') {
    window.TthcCatalog = {
        open: () => openCatalogWindow(),
        openProcedure: procedureId => openCatalogWindow(procedureId),
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
        TTHC_LABEL_RE,
        TTHC_DETAIL_FALLBACK,
        TTHC_FEE_FALLBACK
    };
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initTthcCatalog);
}
