/**
 * faq_engine.js — Bộ máy tìm kiếm FAQ
 *
 * Karpathy principle: "Build it from scratch."
 * Không dùng thư viện fuzzy search bên ngoài.
 * Toàn bộ logic nằm gọn trong một class, dễ đọc từ đầu đến cuối.
 *
 * Thuật toán:
 *   1. normalize() — bỏ dấu tiếng Việt, lowercase, chuẩn hóa 'đ'
 *   2. buildIndex() — chạy normalize một lần, lưu vào .index[]
 *   3. search(query) — tính score, sort, trả về top-N kết quả
 *
 * Score:
 *   +10  khớp cụm từ nguyên vẹn trong câu hỏi
 *   +8   khớp cụm từ nguyên vẹn trong tags
 *   +2   mỗi token khớp trong câu hỏi
 *   +1   mỗi token khớp trong tags
 */

window.FaqEngine = class FaqEngine {
    constructor() {
        this._index = [];
        this._cache = new Map();
        this._buildIndex();
    }

    // Chuẩn hóa chuỗi: bỏ dấu tiếng Việt, lowercase
    // Quan trọng: chạy một lần khi build index, không chạy lại mỗi lần search
    _normalize(str) {
        if (!str) return '';
        return str
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd');
    }

    _buildIndex() {
        const items = window.FAQ_ITEMS || [];
        this._index = items.map(item => ({
            item,
            nq: this._normalize(item.q),
            ntags: this._normalize(item.tags.join(' ')),
        }));
    }

    // Tìm kiếm chính — trả về mảng FAQ_ITEM đã sort theo score, tối đa maxResults
    search(rawQuery, maxResults = 6) {
        const query = this._normalize(rawQuery.trim());
        if (query.length < 2) return [];

        // Cache hit
        const cached = this._cache.get(query);
        if (cached) return cached;

        const tokens = query.split(/\s+/).filter(t => t.length > 0);

        const scored = [];
        for (const entry of this._index) {
            let score = 0;
            // Khớp cụm nguyên vẹn (phrase match) — ưu tiên cao hơn
            if (entry.nq.includes(query))   score += 10;
            if (entry.ntags.includes(query)) score += 8;
            // Khớp từng token
            for (const token of tokens) {
                if (entry.nq.includes(token))   score += 2;
                if (entry.ntags.includes(token)) score += 1;
            }
            if (score > 0) scored.push({ entry, score });
        }

        const results = scored
            .sort((a, b) => b.score - a.score)
            .slice(0, maxResults)
            .map(s => s.entry.item);

        // Giữ cache nhỏ gọn — tối đa 50 query
        if (this._cache.size >= 50) {
            this._cache.delete(this._cache.keys().next().value);
        }
        this._cache.set(query, results);

        return results;
    }

    // Lấy tất cả câu hỏi thuộc một category
    byCategory(catId) {
        return (window.FAQ_ITEMS || []).filter(item => item.category === catId);
    }
};
