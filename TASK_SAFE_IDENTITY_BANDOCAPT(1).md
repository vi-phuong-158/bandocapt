# TASK: Bổ sung nhận diện an toàn cho Bản đồ Công an số tỉnh Phú Thọ

## 1. Mục tiêu

Thi công bổ sung nhận diện cho dự án `bandocapt` theo hướng:

- Người dùng nhận biết rõ đây là **công trình thanh niên có chủ thể xây dựng cụ thể**.
- Tạo độ tin cậy bằng liên kết bài giới thiệu của Báo Phú Thọ.
- Không làm người dùng hiểu nhầm đây là Cổng dịch vụ công hoặc hệ thống tiếp nhận hồ sơ hành chính.
- Không thay đổi chức năng bản đồ, dữ liệu địa điểm, dữ liệu thủ tục, chatbot RAG hoặc API.

Tên chủ thể bắt buộc, không được viết khác:

> **Câu lạc bộ Đổi mới sáng tạo Tuổi trẻ Công an tỉnh Phú Thọ**

Liên kết giới thiệu công trình bắt buộc:

> https://baophutho.vn/van-hanh-ung-dung-nbsp-ban-do-cong-an-so-tinh-phu-tho-258512.htm

---

## 2. Yêu cầu đọc trước khi sửa

Đọc đầy đủ:

- `AGENTS.md`
- `DESIGN_SYSTEM.md`
- toàn bộ `docs/brain/`
- đặc biệt `docs/brain/01-architecture.md`
- `docs/brain/04-current-tasks.md`
- `docs/brain/05-testing-and-deploy.md`

Không code trước khi xác định đầy đủ các vị trí đang hiển thị tên sản phẩm và chatbot.

---

## 3. Phạm vi được sửa

Ưu tiên chỉ sửa:

- `index.html`
- `styles.css`
- `js/chatbot.js`
- test liên quan trong `test/`
- `docs/brain/06-ai-working-log.md`

Chỉ tạo file JavaScript cấu hình riêng nếu thực sự cần thiết. Không tạo abstraction lớn cho thay đổi nhỏ này.

---

## 4. Không được làm

- Không sửa `api/`.
- Không sửa Pinecone, Firebase, Gemini, DeepSeek, Google Sheets hoặc luồng RAG.
- Không sửa dữ liệu trụ sở, vị trí bản đồ hoặc dữ liệu thủ tục hành chính.
- Không thêm đăng nhập, biểu mẫu, upload tệp hoặc chức năng thu thập thông tin cá nhân.
- Không thêm popup tự mở khi người dùng truy cập.
- Không thêm banner cảnh báo màu đỏ hoặc phần “miễn trừ trách nhiệm” dài.
- Không thay logo hiện có.
- Không tự nhận sản phẩm là:
  - cổng thông tin chính thức;
  - cổng dịch vụ công;
  - hệ thống tiếp nhận hồ sơ;
  - trợ lý chính thức;
  - cán bộ trực tuyến.
- Không commit, push hoặc deploy nếu người dùng chưa yêu cầu.

---

## 5. Nội dung phải thi công

### 5.1. Metadata

Trong `index.html`, cập nhật:

```html
<title>Bản đồ Công an số tỉnh Phú Thọ</title>
<meta
  name="description"
  content="Công trình thanh niên hỗ trợ tra cứu địa điểm, thông tin liên hệ và thủ tục hành chính công khai trên địa bàn tỉnh Phú Thọ."
>
```

Không dùng mô tả “hệ thống chính thức”, “cổng thông tin” hoặc “dịch vụ công trực tuyến”.

### 5.2. Nhận diện tại khu vực tiêu đề

Giữ tên chính:

> **Bản đồ Công an số**

Giữ dòng địa bàn:

> **Tỉnh Phú Thọ**

Bổ sung một dòng nhận diện nhỏ ngay dưới tên hoặc trong khu vực thông tin cạnh tiêu đề:

> **CÔNG TRÌNH THANH NIÊN**

Bổ sung tên chủ thể:

> **Câu lạc bộ Đổi mới sáng tạo Tuổi trẻ Công an tỉnh Phú Thọ**

Bổ sung mô tả ngắn:

> **Hỗ trợ tra cứu địa điểm và thủ tục hành chính công khai**

Yêu cầu giao diện:

- chữ nhận diện nhỏ hơn tên sản phẩm;
- trang trọng, tinh tế;
- không chiếm quá nhiều diện tích bản đồ;
- không làm vỡ bố cục mobile;
- không dùng hiệu ứng dấu tích xanh xác minh.

### 5.3. Liên kết xác tín từ Báo Phú Thọ

Thêm nút hoặc liên kết nhỏ:

> **Xem bài giới thiệu công trình**

Liên kết tới:

```text
https://baophutho.vn/van-hanh-ung-dung-nbsp-ban-do-cong-an-so-tinh-phu-tho-258512.htm
```

Yêu cầu kỹ thuật:

```html
target="_blank"
rel="noopener noreferrer"
```

Có thể đặt tại:

- khu vực “Thông tin công trình”; hoặc
- cuối sidebar; hoặc
- footer.

Không đặt thành nút hành động chính lấn át chức năng tìm kiếm và bản đồ.

Có thể thêm dòng phụ ngắn:

> **Công trình đã được Báo Phú Thọ giới thiệu**

Không được đổi thành:

- “Báo Phú Thọ xác nhận chính thức”;
- “được cơ quan có thẩm quyền chứng nhận”;
- “website chính thức”.

### 5.4. Nút “Thông tin công trình”

Thêm nút nhỏ:

> **Thông tin công trình**

Khi bấm, mở modal hoặc bottom sheet. Không tự mở khi tải trang.

Nội dung chính xác:

**Tiêu đề**

> Bản đồ Công an số tỉnh Phú Thọ

**Chủ thể xây dựng**

> Công trình thanh niên của Câu lạc bộ Đổi mới sáng tạo Tuổi trẻ Công an tỉnh Phú Thọ.

**Mục đích**

> Hỗ trợ người dân tra cứu nhanh địa điểm, thông tin liên hệ và thủ tục hành chính được công khai.

**Phạm vi hỗ trợ**

> Công trình không trực tiếp tiếp nhận hoặc giải quyết hồ sơ hành chính. Khi cần thực hiện thủ tục trực tuyến, người dùng được chuyển tới hệ thống chính thức tương ứng.

**Nguyên tắc sử dụng**

> Người dùng không cần cung cấp thông tin cá nhân để sử dụng các chức năng tra cứu cơ bản.

**Liên kết**

> Xem bài giới thiệu công trình trên Báo Phú Thọ

Modal phải:

- đóng được bằng nút;
- đóng được bằng phím `Escape`;
- đóng được khi bấm backdrop;
- có focus phù hợp;
- có `aria-labelledby` hoặc cơ chế accessibility tương đương.

### 5.5. Dải thông tin nhỏ

Đặt tại cuối sidebar hoặc dưới phần nhận diện:

> **Nguồn dữ liệu công khai · Cập nhật thường xuyên · Không yêu cầu đăng nhập**

Thiết kế dạng dòng phụ hoặc chip nhẹ, không dùng màu cảnh báo.

---

## 6. Chỉnh nhận diện chatbot

Sửa đồng bộ nội dung trong `index.html` và `js/chatbot.js`.

Tên chatbot:

> **Trợ lý tra cứu thủ tục và địa điểm**

Trạng thái:

> **Hỗ trợ tra cứu tự động**

Lời chào:

> **Xin chào! Tôi có thể giúp bạn tìm thủ tục hành chính phù hợp và địa điểm thực hiện gần nhất.**

Dòng hướng dẫn:

> **Bạn chỉ cần mô tả thủ tục cần tìm; không cần nhập số CCCD, số điện thoại hoặc thông tin cá nhân.**

Thay cảnh báo hiện tại bằng:

> **Nội dung được tổng hợp từ dữ liệu công khai. Vui lòng kiểm tra nguồn đính kèm trước khi thực hiện thủ tục.**

Không lặp thông báo này trong mọi câu trả lời.

Không thay đổi logic chatbot, API hoặc dữ liệu trả lời.

---

## 7. Hiển thị nguồn

- Giữ nguyên hệ thống citation hiện có.
- Link nguồn mở tab mới.
- Link ngoài phải có `rel="noopener noreferrer"`.
- Dùng nhãn:
  - `Xem nguồn`; hoặc
  - `Nguồn đối chiếu`.
- Không dùng `Nguồn chính thức` nếu record không có URL nguồn hợp lệ.
- Không tự tạo ngày cập nhật.
- Chỉ hiển thị ngày xác minh khi dữ liệu đã có trường thật tương ứng.

---

## 8. Kiểm thử bắt buộc

Bổ sung hoặc cập nhật test để kiểm tra:

1. Có đúng chuỗi:

```text
Câu lạc bộ Đổi mới sáng tạo Tuổi trẻ Công an tỉnh Phú Thọ
```

2. Có đúng URL bài Báo Phú Thọ.

3. Link Báo Phú Thọ có:

```html
target="_blank"
rel="noopener noreferrer"
```

4. Chatbot hiển thị đúng tên, lời chào và dòng hướng dẫn mới.

5. Modal thông tin công trình:

- mở được;
- đóng bằng nút;
- đóng bằng `Escape`;
- đóng bằng backdrop.

6. Không xuất hiện trong nội dung nhận diện mới các cụm:

```text
cổng thông tin chính thức
cổng dịch vụ công chính thức
hệ thống tiếp nhận hồ sơ
trợ lý chính thức
cán bộ trực tuyến
```

7. Không làm hỏng:

- bản đồ;
- tìm kiếm địa điểm;
- danh sách thủ tục;
- chatbot;
- bố cục desktop;
- bố cục mobile.

Chạy:

```bash
npm test
npm run build
```

Nếu môi trường cho phép:

```bash
npm run test:e2e
```

---

## 9. Tiêu chí hoàn thành

Task chỉ hoàn thành khi:

- nhận diện đúng tên chủ thể;
- có liên kết xác tín tới bài Báo Phú Thọ;
- người dùng hiểu đây là công trình thanh niên hỗ trợ tra cứu;
- không có cách diễn đạt khiến sản phẩm bị hiểu là cổng tiếp nhận hồ sơ chính thức;
- không phát sinh thu thập dữ liệu mới;
- không thay đổi logic nghiệp vụ;
- test và build thành công;
- cập nhật `docs/brain/06-ai-working-log.md`.

---

## 10. Báo cáo sau thi công

Agent phải báo cáo:

1. Danh sách file đã sửa.
2. Nội dung nhận diện đã bổ sung.
3. Vị trí đặt liên kết Báo Phú Thọ.
4. Test đã chạy và kết quả.
5. Các điểm chưa làm được, nếu có.
6. Xác nhận chưa commit, push hoặc deploy.
