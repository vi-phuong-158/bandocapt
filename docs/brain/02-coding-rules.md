# 02 — Coding Rules

## Nguyên tắc chung

- Viết ít nhất có thể để giải quyết đúng task. Không tính năng speculative.
- Không abstraction sớm: 3 đoạn lặp vẫn tốt hơn 1 abstraction non.
- Không xử lý lỗi cho kịch bản không thể xảy ra.
- Comment WHY, không comment WHAT — tên biến/hàm đã nói WHAT.
- Không refactor code lân cận nếu không liên quan task.

## Nguyên tắc Ponytail ("senior dev lười hiệu quả")

> LUÔN có hiệu lực, trừ khi người dùng nói **"tắt ponytail"** / **"normal mode"**.
> Lười = hiệu quả, không phải cẩu thả. Code tốt nhất là code không cần viết.

### Thang quyết định — dừng ở nấc đầu tiên thỏa mãn
1. Việc này có cần tồn tại không? Nhu cầu suy diễn → bỏ qua, nói rõ 1 dòng. (YAGNI)
2. Thư viện chuẩn (stdlib) làm được? → Dùng nó.
3. Tính năng có sẵn của nền tảng phủ được? → Dùng (ràng buộc DB thay vì code, CSS thay vì JS).
4. Dependency đã cài giải quyết được? → Dùng. KHÔNG thêm thư viện mới cho việc vài dòng.
5. Gói trong 1 dòng được? → Một dòng.
6. Chỉ khi đó: viết lượng code tối thiểu chạy được.

### Quy tắc
- Không abstraction khi chưa được yêu cầu.
- Không boilerplate, không scaffolding "để dành sau".
- Ưu tiên xóa hơn thêm. Đơn giản hơn "thông minh". Ít file nhất, diff ngắn nhất.

### TUYỆT ĐỐI KHÔNG được "lười" ở
- Validation dữ liệu đầu vào ở ranh giới tin cậy (user input, API response).
- Xử lý lỗi để tránh mất dữ liệu.
- Các biện pháp bảo mật (CORS, HMAC, injection detection, rate limit).
- Bất cứ thứ gì người dùng yêu cầu rõ ràng.

## Style code

- **Ngôn ngữ / runtime:** JavaScript (ES2020+), Node.js 20 CommonJS cho serverless.
  Frontend dùng Vanilla JS (không module bundler, không TypeScript).
- **Format:** 4 spaces indent. Single quotes trong JS (`'string'`).
- **Linter / formatter:** không có linter cấu hình — theo style code hiện tại trong file.

## Đặt tên

- **Biến / hàm JS:** camelCase (`userMessage`, `detectPromptInjection`).
- **Hằng số:** UPPER_SNAKE_CASE (`GEMINI_CHAT_API_URL`, `FAQ_CACHE_TTL`).
- **File:** kebab-case hoặc camelCase theo quy ước hiện tại (`api/chat.js`, `js/chatbot.js`).
- **ID HTML:** kebab-case (`search-panel`, `close-search-btn`).
- **CSS class:** Tailwind utilities + custom class trong `styles.css` theo BEM lỏng.

## Bảo mật

- **Không hardcode secret/API key** — tất cả qua biến môi trường Vercel.
- **CORS whitelist** cứng trong `api/chat.js` — thêm origin mới vào `ALLOWED_ORIGINS` env, không
  sửa hardcode trừ khi cần thêm vĩnh viễn.
- **HMAC request signing** (`X-Request-Token`) — không bỏ qua cơ chế này.
- **Prompt injection detection** — INJECTION_PATTERNS trong `api/chat.js` là danh sách sống; thêm
  pattern khi phát hiện vector tấn công mới, không xóa pattern cũ.
- **Sanitize retrieved documents** — tất cả text từ Pinecone phải qua `sanitizeRetrievedDocumentText`.
- **Không log dữ liệu nhạy cảm** — IP phải được hash trước khi log (`hashForLog`).
- **Không commit `.env`** hay bất kỳ file chứa giá trị secret thật.

## Không làm

- Không tự ý thay đổi system prompt hardcode (`SYSTEM_PROMPT_BASE` trong `api/chat.js`) mà không
  có chỉ thị rõ ràng — thay đổi system prompt ảnh hưởng trực tiếp đến hành vi chatbot với người dùng.
- Không xóa các lớp bảo mật (CAPTCHA, HMAC, rate limit) dù chúng làm phức tạp code.
- Không thêm framework JS (React, Vue...) vào frontend — dự án chọn Vanilla JS có chủ đích.
- Không build TailwindCSS trên Vercel — `output.css` đã pre-built và commit.

## Test

Test tự động dùng Node test runner trong `test/*.test.js`:

```bash
npm test
npm run build
npm run ci
```

Mọi sửa đổi bảo mật hoặc boundary dữ liệu phải có test deny/failure tương ứng. Checklist thủ công
trước khi commit vẫn bắt buộc cho hành vi trình duyệt:
- [ ] Bản đồ hiển thị đủ marker, tìm kiếm hoạt động đúng.
- [ ] Chatbot gửi tin, nhận stream, hiển thị đúng nguồn trích dẫn.
- [ ] Không có API key / secret nào lộ trong console log hay response.
- [ ] Giao diện mobile và desktop đều đúng layout.

## Git

- Branch từ nhánh chính, đặt tên rõ: `feat/...`, `fix/...`, `docs/...`.
- Commit message ngắn gọn, format: `type: short description` (đã theo convention trong git log).
- Không push thẳng `main` nếu chưa được yêu cầu.
