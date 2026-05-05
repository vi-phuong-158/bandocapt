/**
 * faq_ui.js — Controller giao diện Chatbot FAQ
 *
 * Karpathy principle: "Each function does one thing."
 * Không có state ẩn. Mọi trạng thái nằm trong object FaqUI.
 * Đọc từ trên xuống dưới là hiểu toàn bộ flow.
 *
 * Flow:
 *   init() → render menu danh mục
 *   click danh mục → renderCategory(catId)
 *   click câu hỏi → renderAnswer(item)
 *   gõ search → debounce → onSearch() → renderSearchResults()
 */

window.FaqUI = class FaqUI {
    constructor() {
        // Tham chiếu DOM — lấy một lần, dùng nhiều lần
        this.toggleBtn  = document.getElementById('faq-toggle-btn');
        this.window     = document.getElementById('faq-window');
        this.closeBtn   = document.getElementById('faq-close-btn');
        this.body       = document.getElementById('faq-body');
        this.input      = document.getElementById('faq-search-input');

        this.engine = new window.FaqEngine();
        this._isOpen = false;
        this._debounceTimer = null;

        this._bindEvents();
        this._renderMainMenu();
    }

    // ── Bật/tắt cửa sổ ──────────────────────────────────────────────────

    _bindEvents() {
        // stopPropagation: ngăn event bubble lên document ngay sau khi mở,
        // tránh listener 'click outside' bắt ngay và đóng cửa sổ.
        this.toggleBtn.addEventListener('click', e => {
            e.stopPropagation();
            this._toggle();
        });
        this.window.addEventListener('click', e => e.stopPropagation());
        this.closeBtn.addEventListener('click', e => {
            e.stopPropagation();
            this._close();
        });
        this.input.addEventListener('input', () => {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = setTimeout(() => this._onSearch(), 280);
        });
        // Đóng khi click ra ngoài cửa sổ
        document.addEventListener('click', () => {
            if (this._isOpen) this._close();
        });
    }

    _toggle() {
        this._isOpen ? this._close() : this._open();
    }

    _open() {
        this._isOpen = true;
        this.window.classList.remove('faq-window--hidden');
        this.window.classList.add('faq-window--visible');
        this.toggleBtn.setAttribute('aria-expanded', 'true');
        this.input.focus();
    }

    _close() {
        this._isOpen = false;
        this.window.classList.remove('faq-window--visible');
        this.window.classList.add('faq-window--hidden');
        this.toggleBtn.setAttribute('aria-expanded', 'false');
    }

    // ── Render helpers ───────────────────────────────────────────────────

    // Tạo nút bấm — tách thành hàm riêng để tránh lặp HTML
    _makeBtn(label, iconName, onClick, extraClass = '') {
        const btn = document.createElement('button');
        btn.className = `faq-btn ${extraClass}`;
        btn.innerHTML = `<span class="material-symbols-outlined faq-btn__icon">${iconName}</span><span class="faq-btn__label">${label}</span>`;
        btn.addEventListener('click', onClick);
        return btn;
    }

    // Thêm tin nhắn bot vào cuối body
    _addBotMsg(html) {
        const div = document.createElement('div');
        div.className = 'faq-msg faq-msg--bot';
        div.innerHTML = html; // html từ FAQ_ITEMS là trusted content (không từ user input)
        this.body.appendChild(div);
        this._scrollToBottom();
    }

    // Thêm "tin nhắn" của user (text thuần — escape để an toàn)
    _addUserMsg(text) {
        const div = document.createElement('div');
        div.className = 'faq-msg faq-msg--user';
        div.textContent = text; // textContent — không render HTML từ user
        this.body.appendChild(div);
        this._scrollToBottom();
    }

    _clearOptions() {
        // Xóa tất cả .faq-options nếu có
        const existing = this.body.querySelector('.faq-options');
        if (existing) existing.remove();
    }

    _appendOptions(buttons) {
        this._clearOptions();
        const wrap = document.createElement('div');
        wrap.className = 'faq-options';
        buttons.forEach(btn => wrap.appendChild(btn));
        this.body.appendChild(wrap);
        this._scrollToBottom();
    }

    _scrollToBottom() {
        this.body.scrollTop = this.body.scrollHeight;
    }

    // Hiệu ứng loading giả (500ms) để tránh cảm giác "tức thì" quá máy móc
    _showLoading(thenDo) {
        const dot = document.createElement('div');
        dot.className = 'faq-msg faq-msg--bot faq-msg--loading';
        dot.innerHTML = '<span></span><span></span><span></span>';
        this.body.appendChild(dot);
        this._scrollToBottom();
        setTimeout(() => {
            dot.remove();
            thenDo();
        }, 420);
    }

    // ── Các màn hình ────────────────────────────────────────────────────

    _renderMainMenu() {
        const cats = window.FAQ_CATEGORIES || [];
        const btns = cats.map(cat =>
            this._makeBtn(cat.label, cat.icon, () => this._selectCategory(cat))
        );
        this._appendOptions(btns);
    }

    _selectCategory(cat) {
        this._addUserMsg(cat.label);
        this._clearOptions();
        this._showLoading(() => {
            this._addBotMsg(`Đây là các câu hỏi về <b>${cat.label}</b>:`);
            this._renderCategoryMenu(cat.id);
        });
    }

    _renderCategoryMenu(catId) {
        const items = this.engine.byCategory(catId);
        const btns = items.map(item =>
            this._makeBtn(item.q, 'chevron_right', () => this._selectQuestion(item, catId))
        );
        // Nút quay lại
        btns.push(this._makeBtn('Danh mục chính', 'arrow_back', () => {
            this._clearOptions();
            this._renderMainMenu();
        }, 'faq-btn--back'));
        this._appendOptions(btns);
    }

    _selectQuestion(item, catId) {
        this._addUserMsg(item.q);
        this._clearOptions();
        this._showLoading(() => {
            this._addBotMsg(item.a);
            this._renderPostAnswerNav(catId);
        });
    }

    _renderPostAnswerNav(catId) {
        const btns = [
            this._makeBtn('Xem câu hỏi khác', 'format_list_bulleted',
                () => { this._clearOptions(); this._renderCategoryMenu(catId); }),
            this._makeBtn('Trang chủ', 'home',
                () => { this._clearOptions(); this._renderMainMenu(); }, 'faq-btn--back'),
        ];
        this._appendOptions(btns);
    }

    // ── Tìm kiếm ────────────────────────────────────────────────────────

    _onSearch() {
        const q = this.input.value.trim();
        if (q.length < 2) {
            // Khi xóa hết, quay về menu
            this._clearOptions();
            this._renderMainMenu();
            return;
        }
        const results = this.engine.search(q);
        this._renderSearchResults(results, q);
    }

    _renderSearchResults(results, q) {
        this._clearOptions();
        if (results.length === 0) {
            this._appendOptions([
                this._makeBtn('Không tìm thấy kết quả', 'search_off', () => {}),
            ]);
            return;
        }
        const btns = results.map(item =>
            this._makeBtn(item.q, 'help_outline', () => this._selectQuestion(item, item.category))
        );
        this._appendOptions(btns);
    }
};

// Khởi động sau khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
    window.faqUI = new window.FaqUI();
});
