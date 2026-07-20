# KỊCH BẢN THUYẾT TRÌNH HOÀN CHỈNH
## BẢN ĐỒ CÔNG AN SỐ TỈNH PHÚ THỌ

> **Đối tượng nghe:** Lãnh đạo Công an tỉnh, cán bộ và đoàn viên thanh niên  
> **Phong cách:** Trang trọng, dễ hiểu, lấy hiệu quả phục vụ nhân dân làm trọng tâm  
> **Thời lượng dự kiến:** khoảng 12 phút, chưa tính thời gian trình chiếu video  
> **Nguyên tắc:** Khẳng định rõ những gì hệ thống đã làm được; hạn chế thuật ngữ kỹ thuật; mọi điểm cần hoàn thiện đều đi kèm phương án xử lý.

---

# I. SỐ LIỆU SỬ DỤNG TRONG BÀI

Số liệu chốt đến ngày **20/07/2026**. Khi cập nhật bài trình bày, cần giữ rõ phạm vi của từng chỉ số.

| Chỉ số | Số liệu sử dụng | Ghi chú |
|---|---:|---|
| Trụ sở/địa điểm trên bản đồ | **141** | 141/141 bản ghi public có tọa độ hợp lệ khi kiểm tra ngày 20/07/2026 |
| Thủ tục hiện hành trên production | **156** | Kho có 157 bản ghi thủ tục; 1 bản ghi cũ được giữ làm tham chiếu nhưng không dùng để trả lời |
| Lĩnh vực nguồn TTHC | **18** | Theo snapshot Trang thông tin điện tử Công an tỉnh ngày 15/07/2026 |
| Tổng bản ghi trong kho kiến thức | **503** | 157 thủ tục + 152 đoạn luật + 194 đoạn hướng dẫn |
| Ngôn ngữ | **4** | Tiếng Việt, tiếng Anh, tiếng Trung, tiếng Hàn |
| Kiểm thử lõi | **30 câu × 3 lượt** | Chấm theo cổng đa số; không có hard-fail/provider-error theo đa số ở lần gate gần nhất |
| Kiểm thử truy hồi mở rộng | **91 câu** | 89 PASS, 2 WARN, 0 FAIL |
| Kiểm thử tự động | **306** | Unit/contract/integration test tại mốc kiểm tra gần nhất |
| Thời gian phản hồi p95 | **17–28 giây** | Đo nội bộ; phụ thuộc nhà cung cấp AI và việc sử dụng dự phòng |
| Giới hạn vận hành | **3.500 lượt/tháng; 20 lượt/ngày/IP** | Cấu hình bảo vệ ngân sách và chống lạm dụng |
| Snapshot nguồn TTHC gần nhất | **15/07/2026** | Thu thập đủ 157/157 mục, không lỗi |
| Cập nhật kho production gần nhất | **17/07/2026** | Kho production 503 bản ghi |
| Địa chỉ truy cập | **https://bandocapt.vercel.app** | Dùng để tạo mã QR trên slide |

**Phương án thí điểm đề xuất:** 03 tháng, 03 đơn vị đại diện, 20 thủ tục thường gặp. Tên đơn vị, đầu mối và dự toán kinh phí do Lãnh đạo phê duyệt trước khi triển khai.

---

# II. KỊCH BẢN THEO 11 SLIDE

## SLIDE 1 — BẢN ĐỒ CÔNG AN SỐ TỈNH PHÚ THỌ

### Nội dung hiển thị

**SẢN PHẨM RA MẮT CỦA CÂU LẠC BỘ SÁNG TẠO**

# BẢN ĐỒ CÔNG AN SỐ  
### Tỉnh Phú Thọ

- Dành cho công dân
- Bản đồ tương tác
- AI tư vấn tự động

**Tác giả xây dựng:** Người trình bày  
**Phối hợp:** Ban Thanh niên Công an tỉnh thu thập, đối chiếu vị trí trụ sở

### Lời trình bày

Kính thưa các đồng chí Lãnh đạo Công an tỉnh, kính thưa toàn thể các đồng chí!

Hôm nay, tôi xin giới thiệu **“Bản đồ Công an số tỉnh Phú Thọ”** — sản phẩm ra mắt của Câu lạc bộ Sáng tạo.

Tôi là tác giả trực tiếp xây dựng hệ thống. Trong quá trình thực hiện, Ban Thanh niên Công an tỉnh đã phối hợp thu thập và đối chiếu vị trí các trụ sở Công an để đưa lên bản đồ.

Phần trình bày tập trung vào ba nội dung: khó khăn người dân đang gặp; cách công trình hỗ trợ tra cứu trụ sở và thủ tục; và mô hình vận hành để sản phẩm phục vụ nhân dân chính xác, an toàn, bền vững.

---

## SLIDE 2 — THỰC TRẠNG: MỘT VÒNG LẶP CHƯA ĐƯỢC GIẢI QUYẾT

### Nội dung hiển thị

# LẶP LẠI

**Chưa biết đúng nơi**  
→ **Chuẩn bị chưa đúng**  
→ **Phải đi lại**  
→ **Tiếp tục hỏi**

- Người dân mất thời gian tìm kiếm
- Cán bộ phải giải đáp những câu hỏi gần giống nhau

### Lời trình bày

Một người dân cần làm thủ tục thường phải tự trả lời nhiều câu hỏi: nộp ở cấp xã hay cấp tỉnh, chuẩn bị giấy tờ gì, địa chỉ và số điện thoại ở đâu.

Thông tin đã có nhưng nằm ở nhiều nguồn. Nếu tìm chưa đúng, người dân có thể chuẩn bị thiếu hoặc đến sai nơi. Ở chiều ngược lại, cán bộ phải giải đáp nhiều câu hỏi gần giống nhau.

Đó là vòng lặp công trình muốn góp phần giải quyết: giúp người dân được hướng dẫn đúng ngay từ đầu và giảm những câu hỏi lặp lại cho cán bộ tiếp dân.

---

## SLIDE 3 — NHU CẦU CỐT LÕI CỦA NGƯỜI DÂN

### Nội dung hiển thị

# Người dân cần được hướng dẫn **chính xác**  
# trước khi đến làm thủ tục.

**Đúng nơi — Đúng thủ tục — Đúng thông tin**

### Lời trình bày

Nhu cầu cốt lõi rất rõ: trước khi đi làm thủ tục, người dân cần biết **đúng nơi, đúng hồ sơ và đúng đầu mối liên hệ**.

Từ nhu cầu đó, Câu lạc bộ Sáng tạo xây dựng Bản đồ Công an số: một công cụ có thể hỗ trợ tra cứu cả ngoài giờ hành chính và ưu tiên thông tin từ nguồn đã được kiểm soát.

---

## SLIDE 4 — GIẢI PHÁP: MỘT ĐIỂM CHẠM CHO NGƯỜI DÂN

### Nội dung hiển thị

# BẢN ĐỒ CÔNG AN SỐ

**Một điểm chạm để người dân tra cứu đúng nơi và hỏi đúng thủ tục**

### Hai chức năng chính

1. **Bản đồ tương tác**  
   Tìm địa chỉ, vị trí và thông tin liên hệ của các trụ sở Công an.

2. **Trợ lý AI**  
   Hướng dẫn thủ tục, hồ sơ, thẩm quyền và thông tin liên quan.

### Quy mô hiện tại

- **141** trụ sở/địa điểm
- **156** thủ tục hiện hành
- **18** lĩnh vực nguồn
- **503** bản ghi trong kho kiến thức

**Truy cập:** bandocapt.vercel.app

### Lời trình bày

Bản đồ Công an số tạo một điểm truy cập chung cho hai nhu cầu.

Thứ nhất, người dân tìm địa chỉ, vị trí và thông tin liên hệ của **141 trụ sở, địa điểm** trên bản đồ. Dữ liệu vị trí được tác giả xây dựng hệ thống cùng Ban Thanh niên Công an tỉnh phối hợp thu thập, đối chiếu.

Thứ hai, người dân hỏi trợ lý AI về **156 thủ tục hiện hành thuộc 18 lĩnh vực nguồn**. Kho kiến thức production có **503 bản ghi**, gồm dữ liệu thủ tục, **152 đoạn luật** và **194 đoạn hướng dẫn**.

Đây là sự kết hợp giữa bản đồ số và công cụ tư vấn: **một điểm chạm để người dân tra cứu đúng nơi và hỏi đúng thủ tục**.

---

## SLIDE 5 — DỮ LIỆU CHÍNH THỨC, CẬP NHẬT CÓ KIỂM SOÁT

### Nội dung hiển thị

# Dữ liệu không nhập thủ công từng thủ tục

**Trang thông tin điện tử Công an tỉnh**  
→ **Script tự động thu thập**  
→ **Chuẩn hóa dữ liệu**  
→ **Đối chiếu thay đổi**  
→ **Cán bộ nghiệp vụ rà soát**  
→ **Cập nhật kho kiến thức**

- Snapshot nguồn gần nhất: **15/07/2026**
- Cập nhật production gần nhất: **17/07/2026**
- Kho bổ trợ: **152 đoạn luật + 194 đoạn hướng dẫn**
- Đề xuất trong thí điểm: **đối chiếu hằng tuần**

### Lời trình bày

Độ chính xác bắt đầu từ dữ liệu có nguồn. Câu lạc bộ đã xây dựng công cụ tự động thu thập thủ tục từ Trang thông tin điện tử Công an tỉnh Phú Thọ, sau đó chuẩn hóa và đối chiếu thay đổi.

Snapshot gần nhất được lấy ngày **15/07/2026**; kho production được cập nhật ngày **17/07/2026**. Bên cạnh thủ tục, kho có **152 đoạn luật và 194 đoạn hướng dẫn** đã được duyệt.

Việc thu thập được tự động hóa, nhưng nội dung không tự động xuất bản. Mọi thay đổi vẫn cần rà soát trước khi đưa vào production. Trong giai đoạn thí điểm, chúng tôi đề xuất thực hiện đối chiếu hằng tuần để phát hiện nội dung mới, thay đổi hoặc không còn phù hợp.

---

## SLIDE 6 — GIẢM RỦI RO TRẢ LỜI SAI BẰNG 4 BƯỚC KIỂM SOÁT

### Nội dung hiển thị

# Mỗi câu trả lời được kiểm soát qua 4 bước

1. **Tìm đúng nguồn**  
   Ưu tiên tài liệu đúng thẩm quyền, đúng cấp thực hiện.

2. **Kiểm tra ngữ cảnh**  
   Loại bỏ tài liệu gần giống nhưng không đúng trường hợp.

3. **Chỉ trả lời khi có căn cứ**  
   Thiếu thông tin thì báo chưa đủ cơ sở.

4. **Đối chiếu trước khi hiển thị**  
   Kiểm tra địa chỉ, số điện thoại và căn cứ pháp lý.

### Trạng thái

- Cả 4 bước: **Đang hoạt động trên production**

### Lời trình bày

Độ chính xác là yêu cầu quan trọng nhất khi AI hỗ trợ tư vấn thủ tục hành chính. Vì vậy, AI không tự do tìm kiếm trên Internet mà hoạt động trong bốn bước kiểm soát.

Một là ưu tiên nguồn đúng thẩm quyền. Hai là kiểm tra ngữ cảnh và xếp hạng lại khi kết quả còn mơ hồ. Ba là khi chưa đủ căn cứ, hệ thống báo chưa đủ cơ sở thay vì tự suy đoán. Bốn là trước khi hiển thị, các thông tin quan trọng như địa chỉ, số điện thoại, đường dẫn và số liệu pháp lý được đối chiếu với nguồn đã xác minh.

Cả bốn bước hiện đang hoạt động trên production. Kết quả gate gần nhất chạy **30 câu lõi trong 3 lượt** không ghi nhận hard-fail hoặc lỗi nhà cung cấp theo đa số. AI vẫn là công cụ hỗ trợ; trách nhiệm rà soát và quyết định nghiệp vụ thuộc về con người.

---

## SLIDE 7 — MINH HỌA MỘT TÌNH HUỐNG THỰC TẾ

### Nội dung hiển thị

# TỪ MỘT CÂU HỎI ĐẾN MỘT HƯỚNG DẪN HOÀN CHỈNH

**Tình huống minh họa:**  
“Thủ tục cấp lại thẻ tạm trú cần giấy tờ gì?”

Hệ thống hỗ trợ:

1. Xác định đúng thủ tục
2. Liệt kê hồ sơ cần chuẩn bị
3. Xác định đơn vị có thẩm quyền
4. Hiển thị địa chỉ trên bản đồ
5. Dẫn nguồn để kiểm tra lại

> Nội dung trong video là ví dụ minh họa quy trình, không thay thế hướng dẫn chính thức của cán bộ.

### Lời trình bày

Xin mời các đồng chí theo dõi video minh họa câu hỏi: **“Thủ tục cấp lại thẻ tạm trú cần giấy tờ gì?”**

Video thể hiện cách hệ thống nhận câu hỏi, tìm và chọn tài liệu phù hợp, xây dựng câu trả lời rồi hiển thị nguồn để người dân đối chiếu. Đây là minh họa quy trình, không phải nội dung tư vấn chính thức.

---

## SLIDE 8 — THIẾT KẾ CHO NGƯỜI DÂN, QUẢN TRỊ BỞI CÁN BỘ

### Nội dung hiển thị

# Dễ dùng đối với người dân

- Tối ưu cho điện thoại
- Hỏi bằng ngôn ngữ thông thường
- Hỗ trợ **4 ngôn ngữ:** Việt, Anh, Trung, Hàn
- Không yêu cầu kiến thức công nghệ

# Dễ quản trị đối với cán bộ

- Thu thập tự động, cập nhật sau rà soát
- Có thể bổ sung nội dung qua Google Sheets
- Đã có cơ chế báo lỗi và ghi nhận phản hồi
- Hạn chế truy cập tự động bằng Cloudflare Turnstile

### Lời trình bày

Đối với người dân, giao diện được tối ưu cho điện thoại, cho phép hỏi bằng ngôn ngữ thông thường và hỗ trợ bốn ngôn ngữ: Việt, Anh, Trung, Hàn.

Đối với cán bộ, hệ thống có công cụ thu thập dữ liệu, kênh quản trị qua Google Sheets và công cụ nghiệp vụ riêng, cùng nút báo lỗi dưới mỗi câu trả lời để tiếp nhận phản hồi.

Cloudflare Turnstile, giới hạn **3.500 lượt mỗi tháng** và **20 lượt mỗi ngày trên một địa chỉ IP** giúp hạn chế truy cập tự động bất thường. Hệ thống không yêu cầu người dân cung cấp họ tên, số căn cước hoặc thông tin cá nhân nếu không cần cho việc tra cứu.

---

## SLIDE 9 — GIÁ TRỊ ĐÃ CÓ VÀ CHỈ SỐ SẼ ĐO TRONG THÍ ĐIỂM

### Nội dung hiển thị

## Kết quả bước đầu

- **24/7** — Có thể tra cứu cả ngoài giờ hành chính
- **17–28 giây** — Thời gian phản hồi p95 trong kiểm thử nội bộ
- **30 câu × 3 lượt** — Gate chatbot lõi
- **91 câu** — Kiểm thử truy hồi mở rộng
- **306 test** — Kiểm thử tự động
- **0 hard-fail theo đa số** — Kết quả gate production gần nhất

## Chỉ số sẽ đo trong thí điểm

1. Mức độ chính xác của câu trả lời
2. Số phản hồi cần điều chỉnh
3. Thời gian phản hồi
4. Mức độ thuận tiện đối với người dân
5. Khả năng giảm câu hỏi lặp lại cho cán bộ

### Lời trình bày

Hệ thống có thể được truy cập ngoài giờ hành chính. Trong kiểm thử nội bộ, thời gian phản hồi p95 khoảng **17–28 giây**, tùy nhà cung cấp AI.

Gate lõi chạy **30 câu trong 3 lượt**; bộ truy hồi mở rộng có **91 câu**; hệ thống có **306 kiểm thử tự động**. Gate production gần nhất không có hard-fail hoặc lỗi nhà cung cấp theo đa số.

Các con số này chứng minh khả năng vận hành kỹ thuật, chưa thay thế đánh giá thực tế của người dân. Vì vậy, thí điểm sẽ đo thêm độ chính xác, phản hồi cần điều chỉnh, thời gian phản hồi, mức độ thuận tiện và khả năng giảm câu hỏi lặp lại cho cán bộ.

---

## SLIDE 10 — MÔ HÌNH VẬN HÀNH VÀ PHỐI HỢP

### Nội dung hiển thị

# Ba trụ cột vận hành

## 1. Dữ liệu chính thức, cập nhật có kiểm soát
- Thu thập từ Trang thông tin điện tử Công an tỉnh
- Rà soát trước khi cập nhật production
- Đề xuất đối chiếu hằng tuần trong thí điểm
- Bổ sung văn bản pháp luật

## 2. Câu lạc bộ Sáng tạo trực tiếp vận hành
- Quản trị hệ thống
- Theo dõi hoạt động
- Xử lý lỗi kỹ thuật
- Tổng hợp phản hồi
- Tiếp tục nâng cấp sản phẩm

## Phối hợp dữ liệu vị trí
- Ban Thanh niên Công an tỉnh phối hợp thu thập, đối chiếu vị trí trụ sở

## 3. Cán bộ nghiệp vụ đồng hành nội dung
- Rà soát tính chính xác
- Bổ sung tình huống thực tế
- Cập nhật thay đổi nghiệp vụ
- Định kỳ đánh giá câu trả lời

### Lời trình bày

Để vận hành bền vững, chúng tôi đề xuất ba trụ cột.

Thứ nhất là dữ liệu chính thức: công cụ hỗ trợ thu thập, nhưng mọi thay đổi phải được rà soát trước khi cập nhật production.

Thứ hai, tác giả trực tiếp làm đầu mối kỹ thuật: theo dõi hoạt động, xử lý lỗi và tổng hợp phản hồi. Đây là sản phẩm ra mắt của Câu lạc bộ Sáng tạo.

Ban Thanh niên Công an tỉnh phối hợp trong công tác thu thập, đối chiếu dữ liệu vị trí các trụ sở.

Thứ ba, cán bộ nghiệp vụ đồng hành về nội dung: xác nhận tính chính xác, bổ sung tình huống thực tế và thông báo thay đổi quy định.

Phân công cốt lõi rất rõ: tác giả phụ trách công nghệ; Ban Thanh niên phối hợp dữ liệu vị trí; đơn vị nghiệp vụ bảo đảm chất lượng chuyên môn.

---

## SLIDE 11 — ĐỀ XUẤT THÍ ĐIỂM VÀ KIẾN NGHỊ LÃNH ĐẠO

### Nội dung hiển thị

# MỘT CHÍNH QUYỀN SỐ GẦN DÂN

## Phương án thí điểm

- Thời gian: **03 tháng**
- Phạm vi: **03 đơn vị đại diện**
- Đơn vị dự kiến: **01 đơn vị nghiệp vụ cấp tỉnh và 02 đơn vị Công an cấp xã/phường do Lãnh đạo lựa chọn**
- Nội dung: **20 thủ tục thường gặp**
- Đầu mối vận hành: Câu lạc bộ Sáng tạo
- Đơn vị nghiệp vụ: phối hợp rà soát nội dung

## Ba kiến nghị

1. Cho phép triển khai thí điểm
2. Giao đơn vị nghiệp vụ phối hợp chuyên môn
3. Tạo điều kiện duy trì hạ tầng và dịch vụ AI

### Lời trình bày

Kính thưa các đồng chí Lãnh đạo!

Mục tiêu cuối cùng của công trình là giúp người dân tìm đúng nơi, chuẩn bị đúng thủ tục và giảm những lần đi lại không cần thiết.

Trên cơ sở sản phẩm đang vận hành, tôi kính đề nghị ba nội dung.

Một là, cho phép thí điểm trong **03 tháng**, tại **03 đơn vị đại diện**, với **20 thủ tục thường gặp**. Hệ thống được xác định là công cụ hỗ trợ tra cứu, có ghi nhận phản hồi và điều chỉnh thường xuyên.

Hai là, giao đơn vị nghiệp vụ phối hợp rà soát và cập nhật nội dung chuyên môn.

Ba là, tạo điều kiện để Câu lạc bộ Sáng tạo tiếp tục quản trị kỹ thuật và lập dự toán riêng cho hạ tầng, dữ liệu và dịch vụ AI theo lưu lượng thí điểm.

Kết thúc thí điểm, Câu lạc bộ sẽ báo cáo bằng số liệu về độ chính xác, thời gian phản hồi, mức độ thuận tiện, ý kiến cán bộ và khả năng giảm câu hỏi lặp lại; từ đó đề xuất phạm vi nhân rộng phù hợp.

Từ một câu hỏi nhỏ của người dân, chúng ta có thể tạo ra một điểm chạm số thuận tiện, gần dân và thiết thực hơn.

Xin trân trọng cảm ơn các đồng chí!

---

# III. CÂU HỎI DỰ KIẾN TỪ LÃNH ĐẠO

## 1. Dữ liệu có cập nhật khi thủ tục thay đổi không?

Dữ liệu không được nhập cố định một lần. Công cụ tự động thu thập và đối chiếu thủ tục từ Trang thông tin điện tử Công an tỉnh Phú Thọ; nội dung chỉ được cập nhật production sau khi rà soát. Trong thí điểm, chúng tôi đề xuất đối chiếu hằng tuần.

## 2. Nếu AI trả lời sai thì xử lý thế nào?

Hệ thống sử dụng dữ liệu có nguồn, kiểm tra ngữ cảnh và đối chiếu tự động trước khi hiển thị. Khi không đủ căn cứ, hệ thống báo chưa đủ cơ sở và hướng dẫn liên hệ đúng đơn vị. Mỗi câu trả lời đã có nút phản hồi để Câu lạc bộ và cán bộ nghiệp vụ rà soát.

## 3. Ai sẽ vận hành hệ thống?

Tác giả trực tiếp quản trị phần kỹ thuật. Ban Thanh niên Công an tỉnh phối hợp thu thập, đối chiếu dữ liệu vị trí trụ sở; các đơn vị nghiệp vụ phối hợp rà soát và cập nhật chuyên môn. Cơ chế này phân công đúng thế mạnh và không đặt thêm gánh nặng kỹ thuật cho cán bộ nghiệp vụ.

## 4. Chi phí vận hành là bao nhiêu?

Dự toán được lập riêng theo số đơn vị, lưu lượng sử dụng và nhà cung cấp AI được phê duyệt. Hệ thống hiện giới hạn 3.500 lượt mỗi tháng và 20 lượt mỗi ngày trên một địa chỉ IP để kiểm soát ngân sách; chi phí sẽ được đánh giá lại sau thí điểm.

## 5. Công trình đã sẵn sàng đến đâu?

Hệ thống đã vận hành trên production với bản đồ, trợ lý AI, kho 503 bản ghi, công cụ thu thập dữ liệu, cơ chế quản trị và bốn bước kiểm soát câu trả lời. Giai đoạn tiếp theo là thí điểm có tổ chức để đo hiệu quả thực tế và chuẩn hóa cơ chế phối hợp.

## 6. Có thu thập dữ liệu cá nhân của người dân không?

Hệ thống phục vụ tra cứu và không yêu cầu người dân cung cấp họ tên, số căn cước hoặc thông tin cá nhân nếu không cần thiết. Trong quá trình hoàn thiện, Câu lạc bộ tiếp tục rà soát cơ chế lưu nhật ký và bảo vệ nội dung câu hỏi theo quy định.

---

# IV. KIỂM TRA TRƯỚC KHI TRÌNH BÀY

- [ ] Xác nhận lại số liệu nếu trình bày sau ngày 20/07/2026
- [ ] Kiểm tra snapshot nguồn và ngày cập nhật production gần nhất
- [ ] Xác nhận phạm vi và thời gian thí điểm
- [ ] Xác nhận đơn vị nghiệp vụ phối hợp
- [ ] Hoàn thiện dự toán hạ tầng, dữ liệu và dịch vụ AI
- [ ] Kiểm tra video có chạy trên máy trình chiếu
- [ ] Chuẩn bị phương án trình diễn khi mất Internet
- [ ] Kiểm tra đường dẫn và mã QR
- [ ] Chuẩn bị một câu hỏi minh họa dễ hiểu
- [ ] Không đọc nguyên văn toàn bộ chữ trên slide
- [ ] Dừng 1–2 giây sau các câu chốt quan trọng
