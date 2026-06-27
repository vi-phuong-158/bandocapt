# 00 — Project Overview

## Mục tiêu

Bản đồ Công an số tỉnh Phú Thọ: giúp người dân tra cứu vị trí và thông tin các trụ sở Công an
trên bản đồ tương tác (Leaflet + OpenStreetMap), đồng thời cung cấp chatbot tư vấn pháp luật
xuất nhập cảnh (XNC) có RAG — trả lời đa ngôn ngữ (vi/en/zh/ko) dựa trên văn bản pháp luật thật.

## Người dùng chính

- **Người dân tỉnh Phú Thọ** — tìm địa chỉ/SĐT trụ sở Công an gần nhất, xem hướng đi.
- **Người nước ngoài / doanh nghiệp có người nước ngoài** — hỏi thủ tục XNC, mức phạt vi phạm,
  thủ tục hộ chiếu online, mẫu NA5/NA6/NA8.
- **Cán bộ Công an** — quản lý/cập nhật dữ liệu trụ sở qua Google Sheets.

## Phạm vi

### Trong scope
- Bản đồ Leaflet hiển thị marker các trụ sở Công an tỉnh Phú Thọ.
- Tìm kiếm trụ sở theo tên, tìm trụ sở gần vị trí hiện tại.
- Chatbot RAG tư vấn pháp luật XNC (Luật XNC 2019, Nghị định 282/2025, Thông tư 22/2023).
- Streaming SSE từ Gemini 2.5 Flash (hoặc DeepSeek fallback).
- Rate limiting theo tháng (3500 lượt/tháng) và theo IP (20 lượt/ngày).
- CAPTCHA Cloudflare Turnstile chống bot.
- Logging hội thoại vào Firestore / Firebase Realtime DB.

### Ngoài scope
- Không tư vấn ngoài lĩnh vực XNC và hộ chiếu.
- Không có hệ thống đăng nhập / xác thực người dùng.
- Không có tính năng đặt lịch hẹn hay nộp hồ sơ trực tuyến qua app này.

## Điểm khác biệt / giá trị cốt lõi

- RAG với Pinecone + Gemini Embedding: trả lời dựa trên văn bản pháp luật thật, có trích dẫn.
- Re-rank kết quả bằng Gemini Flash để tăng độ chính xác.
- System Prompt lưu trên Vercel Edge Config → cập nhật ngay không cần redeploy.
- Bảo mật nhiều lớp: CORS whitelist, HMAC request signing, Turnstile CAPTCHA, prompt injection detection.
- Tĩnh hoàn toàn ở frontend (HTML/CSS/JS thuần) — không framework, deploy nhanh trên Vercel.

## Trạng thái dự án (2026-06-27)

Production trên Vercel. Bản đồ, chatbot RAG, rate limiting và telemetry đã được tích hợp vào UI.
Repository có test tự động bằng Node test runner, build tĩnh tạo `dist/` và CI chạy test/build/audit.
Runtime bản đồ chỉ yêu cầu sheet `Published_Locations`; dữ liệu tọa độ sai bị loại thay vì tạo vị trí
ngẫu nhiên. Telemetry mặc định không lưu nội dung hội thoại hoặc IP thô.

Việc còn mở quan trọng: bật TTL vận hành cho telemetry trên môi trường thật, triển khai
trigger/menu Apps Script cho pipeline staging-approval ngoài Google Workspace thật, và xác minh
cấu hình/rollback trên Vercel Preview trước phát hành.
