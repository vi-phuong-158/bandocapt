# 00 — Project Overview

## Mục tiêu

Bản đồ Công an số tỉnh Phú Thọ: giúp người dân tra cứu vị trí và thông tin các trụ sở Công an
trên bản đồ tương tác (Leaflet + OpenStreetMap), đồng thời cung cấp chatbot tư vấn thủ tục
hành chính có RAG — trả lời đa ngôn ngữ (vi/en/zh/ko) dựa trên văn bản pháp luật thật.

## Người dùng chính

- **Người dân tỉnh Phú Thọ** — tìm địa chỉ/SĐT trụ sở Công an gần nhất, xem hướng đi.
- **Người nước ngoài / doanh nghiệp có người nước ngoài** — hỏi thủ tục hành chính, mức phạt vi phạm,
  thủ tục trực tuyến.
- **Cán bộ Công an** — quản lý/cập nhật dữ liệu trụ sở qua Google Sheets.

## 4 Trụ cột ứng dụng (Civic App Pillars)

1. **Tra cứu (Discovery):** Bản đồ số Leaflet + OpenStreetMap tra cứu vị trí trụ sở Công an theo tên, địa chỉ và dịch vụ thủ tục hành chính; chip phân loại dịch vụ chuẩn hoá (`LocationTaxonomy`), hành động "Gần tôi" sắp xếp theo GPS.
2. **Chỉ dẫn (Action):** Xem thông tin chi tiết (phân loại, dịch vụ cung cấp, địa chỉ, giờ làm việc thực tế, lưu ý thủ tục hành chính); gọi điện và mở chỉ đường Google Maps nhanh chóng.
3. **Hỏi đáp (AI Civic Chatbot):** Chatbot RAG tư vấn thủ tục hành chính và hướng dẫn liên hệ trụ sở Công an dựa trên cơ sở pháp luật thật với fail-closed guardrails, trích dẫn văn bản quy phạm pháp luật.
4. **Đóng góp cập nhật (Civic Contribution & Staff Portal):** Người dân đóng góp bổ sung/sửa đổi địa điểm công khai tại `/dong-gop/`; Cán bộ Công an xác minh và cập nhật tại `/can-bo/` qua quy trình phê duyệt an toàn.

## Phạm vi

### Trong scope
- Bản đồ Leaflet hiển thị marker các trụ sở Công an tỉnh Phú Thọ.
- Tra cứu trụ sở theo tên, địa chỉ hoặc dịch vụ (`IDENTITY`, `RESIDENCE`, `VEHICLE_REGISTRATION`, v.v.); bộ lọc dịch vụ single-select.
- Giao diện Map-first: desktop sidebar đơn (`BROWSING` <-> `DETAIL`) và mobile bottom sheet 3 trạng thái (`hidden`, `collapsed`, `expanded`).
- Chatbot RAG tư vấn thủ tục hành chính và hướng dẫn liên hệ trụ sở Công an.
- Streaming SSE từ Gemini 2.5 Flash (hoặc DeepSeek fallback).
- Rate limiting chỉ theo IP/ngày; không áp quota tổng ngày/tháng cho toàn hệ thống.
- CAPTCHA Cloudflare Turnstile chống bot.
- Logging hội thoại vào Firestore / Firebase Realtime DB.
- Cổng đóng góp công khai `/dong-gop/` và cổng cán bộ `/can-bo/`.

### Đang thử nghiệm (Chưa thuộc main)
- **Accommodation Beta foundation:** Đang phát triển trên branch/Draft PR riêng (`feat/accommodation-beta`, PR #67); chưa thuộc `main`, chưa phát hành Production, chưa có dữ liệu nhà trọ thật.

### Ngoài scope
- Không tư vấn ngoài lĩnh vực thủ tục hành chính và thông tin trụ sở Công an.
- Không có hệ thống đăng nhập / tài khoản dành cho người dân thông thường (chỉ có OAuth Google Workspace cho cán bộ tại `/can-bo/`).
- Không có tính năng đặt lịch hẹn hay nộp hồ sơ trực tuyến qua app này.

## Điểm khác biệt / giá trị cốt lõi

- RAG với Pinecone + Gemini Embedding: trả lời dựa trên văn bản pháp luật thật, có trích dẫn.
- Re-rank kết quả bằng Gemini Flash để tăng độ chính xác.
- System Prompt hardcode trong `api/chat.js` (`SYSTEM_PROMPT_BASE`) → đổi prompt phải sửa code + redeploy.
- Bảo mật nhiều lớp: CORS whitelist, HMAC request signing, Turnstile CAPTCHA, prompt injection detection.
- Tĩnh hoàn toàn ở frontend (HTML/CSS/JS thuần) — không framework, deploy nhanh trên Vercel.

## Trạng thái dự án (2026-09-04)

Production trên Vercel. Vòng thiết kế R1 Map-First Design Closure đã hoàn thiện:
- Luồng tìm kiếm đa chiều: hỗ trợ match tên, địa chỉ, địa bàn và dịch vụ thủ tục hành chính chuẩn hóa.
- Desktop sidebar đơn với mutual exclusion: `search-panel` và `detail-panel` không xung đột focus/reachability (áp dụng `inert` và `aria-hidden` chính xác theo viewport).
- Trình bày thông tin địa điểm theo cấp bậc: Tên -> Dịch vụ & Phân loại -> Địa chỉ -> Giờ làm việc thật (không có giờ giả) -> SĐT hợp lệ -> Nút CTA Chỉ đường & Gọi điện -> Lưu ý thủ tục & siêu dữ liệu xác minh.
- Độ bền mobile: 0 horizontal overflow trên các viewport từ 320px đến 430px.
- Toàn bộ 642 unit tests, 96 Playwright E2E tests và `npm run ci` đều vượt qua.
