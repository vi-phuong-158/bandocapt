# CLAUDE.md — Hướng dẫn cho Claude Code

> Dành riêng cho **Claude Code**. Codex dùng AGENTS.md.
> Dự án: **bandocapt** — Bản đồ Công an số tỉnh Phú Thọ (tra cứu trụ sở + chatbot tư vấn thủ tục hành chính)

---

## BẮT BUỘC: Đọc trước khi code

Trước khi bắt đầu bất kỳ task nào, đọc **toàn bộ** `docs/brain/`:

```
docs/brain/00-project-overview.md   — mục tiêu, người dùng, phạm vi
docs/brain/01-architecture.md       — stack, luồng xử lý, CODE GRAPH (bản đồ module)
docs/brain/02-coding-rules.md       — quy tắc code, đặt tên, bảo mật
docs/brain/03-decisions.md          — các quyết định kỹ thuật đã chốt
docs/brain/04-current-tasks.md      — task đang làm, task chờ, task không làm
docs/brain/05-testing-and-deploy.md — lệnh cài đặt, chạy, test, deploy
docs/brain/06-ai-working-log.md     — nhật ký các lần AI sửa code
```

**Đặc biệt đọc Code Graph trong `01-architecture.md`** để hiểu quan hệ phụ thuộc giữa các
module — biết "đụng vào file X thì ảnh hưởng những đâu" trước khi sửa, tránh phá vỡ thứ ở xa.

## Cài đặt nhanh

Lệnh cài đặt, chạy dev, test, build, deploy nằm đầy đủ trong
`docs/brain/05-testing-and-deploy.md`. Đọc file đó để dựng môi trường, đừng đoán lệnh.

```bash
npm install
npm run dev   # TailwindCSS watch mode
```

---

## Sau khi sửa code

**Bắt buộc** thêm một entry vào `docs/brain/06-ai-working-log.md`:

```
## [YYYY-MM-DD] [Tên task]
- **Agent:** Claude Code
- **Thay đổi:** <mô tả ngắn>
- **File đã sửa:** <danh sách file>
- **Lý do:** <vì sao>
- **Kiểm tra:** <cách xác minh hoạt động đúng>
```

## Khi thay đổi kiến trúc / API / cấu trúc / database

Nếu thay đổi: stack/dependency mới · cấu trúc thư mục · endpoint hoặc interface API ·
schema database · luồng xử lý chính —

→ **Phải cập nhật** `docs/brain/01-architecture.md` (gồm cả **Code Graph**) **VÀ**
`docs/brain/03-decisions.md`. Code Graph lỗi thời còn nguy hiểm hơn không có, vì agent sau sẽ tin nó.

---

## Quy tắc cứng

1. **Không push thẳng `main`** nếu chưa được người dùng yêu cầu rõ ràng. Tạo nhánh/PR.
2. **Không tự đổi stack** nếu chưa ghi rõ lý do vào `docs/brain/03-decisions.md`.
3. **Không thêm tính năng ngoài scope task** — chỉ làm đúng yêu cầu.
4. **Không hardcode secret/API key** vào source — dùng biến môi trường.
5. Kiểm tra `docs/brain/04-current-tasks.md` trước khi bắt đầu: task có được phép làm không?

## Nguyên tắc code

- **Suy nghĩ trước khi code:** không giả định; nêu rõ đánh đổi; tìm giải pháp đơn giản nhất.
- **Ưu tiên đơn giản:** viết code tối thiểu; không abstraction sớm; không xử lý lỗi cho kịch
  bản không thể xảy ra; 200 dòng làm được trong 50 dòng thì viết lại.
- **Thay đổi phẫu thuật:** chỉ chạm phần cần thiết; không refactor lân cận; theo style hiện tại;
  dọn biến/import thừa do mình tạo.
- **Theo mục tiêu:** biến task thành mục tiêu xác minh được — [Bước làm] → [Cách kiểm tra].
