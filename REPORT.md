# BÁO CÁO REVIEW TOÀN BỘ DỰ ÁN BANDOCAPT

## 1. Thông tin chung

| Hạng mục | Giá trị |
| --- | --- |
| Dự án | `bandocapt` |
| Phạm vi | Toàn bộ mã nguồn, cấu hình triển khai, chatbot, luồng Google Form/Sheet và giao diện |
| Revision nền | `1e999060521b8aea9e44681b783e298f3af78e4c` |
| Trạng thái worktree | Có thay đổi chưa commit liên quan đến việc thay chatbot |
| Số tệp nguồn/cấu hình đã kiểm tra | 20 |
| Kết quả bảo mật | 2 Medium, 2 Low, không có High/Critical đã được xác thực |
| Thiết bị kiểm tra giao diện | Desktop 1280x720; mobile 390x844 và 320x568 |

Phiên review bao gồm:

- Đọc toàn bộ mã nguồn ứng dụng và API.
- Kiểm tra luồng dữ liệu từ Google Form tới Google Sheet và bản đồ công khai.
- Kiểm tra luồng request chatbot từ trình duyệt tới Vercel, Turnstile, Firebase, Pinecone và nhà cung cấp LLM.
- Kiểm tra syntax Node.js, lệnh build/test và dependency audit.
- Chạy ứng dụng cục bộ, kiểm tra desktop/mobile, DOM, accessibility cơ bản và browser console.
- Chạy harness trên handler thật của `api/chat.js` với các dịch vụ ngoài được mock để kiểm chứng các nhánh fail-open.

## 2. Kết luận điều hành

Ứng dụng có giao diện tương đối ổn định trên desktop và mobile, không phát sinh lỗi console trong luồng kiểm tra chính. Phần chatbot mới đã có streaming, RAG, Turnstile, rate limit và citation metadata, nhưng các kiểm soát bảo mật hiện chưa đủ tin cậy để đưa thẳng lên production.

Bốn vấn đề cần xử lý trước hoặc ngay sau lần triển khai tiếp theo:

1. Bản đồ công khai đọc trực tiếp dữ liệu chưa duyệt từ `Form_Responses`.
2. Chatbot lưu toàn bộ câu hỏi, câu trả lời và IP thô vào Firebase, đồng thời có fallback RTDB hardcode.
3. Turnstile tự vô hiệu hóa nếu thiếu secret.
4. Rate limit Firebase tự mất hiệu lực khi Firebase lỗi hoặc từ chối truy cập.

Ngoài bảo mật, rủi ro chất lượng lớn nhất là tọa độ sai bị thay bằng tọa độ ngẫu nhiên, không có test tự động, build không thực sự biên dịch/kiểm tra mã, và danh sách/marker chưa tối ưu cho accessibility cũng như dữ liệu lớn.

## 3. Phát hiện bảo mật

### SEC-01 - Dữ liệu Google Form chưa duyệt được công khai

**Mức độ:** Medium - P1
**Vị trí chính:** `setup/tao-form-thu-thap.js:21-22,117-118`; `app.js:633-688`

Form chỉ bật `setCollectEmail(true)` và tạo một published URL. Email được ghi nhận nhưng không được so sánh với allowlist, không xác minh người gửi đại diện cho đơn vị đã chọn và không có trạng thái phê duyệt.

Frontend gọi trực tiếp:

```js
const data = await fetchSheetData("Form_Responses");
```

Sau đó mọi dòng có tên đơn vị đều được chuyển thành marker công khai. Người có link Form có thể gửi địa chỉ, số điện thoại, ảnh hoặc tọa độ giả và khiến người dân hiểu đó là thông tin chính thức.

> **Combo với COR-01 (đọc kèm).** SEC-01 không đứng một mình. Submission chưa duyệt (SEC-01) cộng với việc tọa độ rác rơi về `Math.random()` quanh một điểm mặc định (COR-01) cho phép tạo **"trụ sở Công an giả" hiển thị ở vị trí trông hợp lý** trên bản đồ chính thức của cơ quan công an. Đây là rủi ro tính toàn vẹn/uy tín, nghiêm trọng hơn tổng hai lỗi riêng lẻ. Hai phát hiện này phải được xử lý cùng nhau và xếp **P0 — ưu tiên số 1**.
>
> Lưu ý kèm theo: `SHEET_ID` đang hardcode ở `app.js:509` là **public** (ai mở DevTools cũng thấy). Vì vậy Google Sheet nguồn phải được thiết kế với giả định **toàn bộ nội dung là công khai**: quyền share read-only và chỉ chứa dữ liệu đã duyệt. Đây là điều kiện tiên quyết của luồng staging/approval.

**Khắc phục đề xuất:**

- Giới hạn Form cho tài khoản/nhóm Google Workspace được phép.
- Kiểm tra email theo allowlist đơn vị.
- Ghi submission vào sheet staging.
- Thêm trạng thái `pending`, `approved`, `rejected` và thông tin người duyệt.
- Website chỉ đọc sheet/API chứa bản ghi đã `approved`.
- Lưu audit log cho mọi thay đổi dữ liệu công khai.

### SEC-02 - Thu thập và lưu trữ quá mức dữ liệu hội thoại

**Mức độ:** Medium - P1
**Vị trí chính:** `api/chat.js:69-109,1257-1269`

Telemetry hiện lưu:

- Tối đa 4.000 ký tự câu hỏi.
- Tối đa 12.000 ký tự câu trả lời.
- IP client dạng plaintext.
- Nguồn RAG, latency, user-agent hash và các metadata khác.

Khi Firestore chưa được cấu hình hoặc ghi lỗi, payload được chuyển sang RTDB hardcode:

```js
const dbUrl = process.env.FIREBASE_DB_URL
    || "https://chatbot-gemini-8c78b-default-rtdb.asia-southeast1.firebasedatabase.app";
```

Đây là dữ liệu pháp lý có khả năng chứa thông tin hộ chiếu, cư trú, việc làm hoặc thông tin định danh. Repository không thể hiện consent, opt-out, retention policy hoặc cơ chế xóa dữ liệu.

**Khắc phục đề xuất:**

- Mặc định chỉ lưu metric tổng hợp: latency, status, model, token usage và nhóm lỗi.
- Không lưu question/answer/IP trong telemetry thông thường.
- Nếu cần debug nội dung, bật bằng feature flag có thời hạn, sampling thấp và quyền truy cập hạn chế.
- Xóa fallback RTDB hardcode; mỗi môi trường chỉ dùng database được cấu hình rõ ràng.
- Pseudonymize IP bằng HMAC với salt riêng và xoay vòng, hoặc bỏ hoàn toàn.
- Xác định retention và job xóa tự động.
- Bổ sung thông báo quyền riêng tư tại UI nếu có lưu nội dung.

### SEC-03 - Turnstile fail-open khi thiếu secret

**Mức độ:** Low severity, P0 priority
**Lý do severity vs priority:** Xác suất thấp (chỉ kích hoạt khi deploy thiếu `TURNSTILE_SECRET_KEY`) nhưng tác động cao (mọi request lọt thẳng tới LLM/Pinecone → cháy ngân sách, abuse). Vì vậy severity = Low nhưng priority = P0. Đừng đọc nhầm "Low" thành "để sau".
**Vị trí chính:** `api/chat.js:294-318,609-620,652-705`

Nhánh hiện tại:

```js
if (!secret) return true;
```

Một client HTTP trực tiếp có thể bỏ header `Origin`, gửi `Content-Type: application/json` và không cần request signing của browser. Nếu Vercel thiếu `TURNSTILE_SECRET_KEY`, request vẫn tới LLM.

Harness đã tái hiện request không có secret, CAPTCHA token, Origin hoặc signing headers nhưng handler vẫn trả HTTP 200.

**Khắc phục đề xuất:**

- Production phải fail deployment hoặc trả 503 nếu thiếu secret.
- Chỉ cho phép bypass bằng `EVAL_BYPASS_TOKEN` trong môi trường test được kiểm soát.
- Kiểm tra `hostname`, `action` và thời gian token trong kết quả Siteverify.
- Tạo Turnstile widget riêng cho dự án `bandocapt`; không dùng chung secret với dự án khác.
- Tách widget/key production và test; cấu hình đúng allowed hostnames.

### SEC-04 - Rate limit Firebase fail-open

**Mức độ:** Low severity, P0 priority
**Lý do severity vs priority:** Như SEC-03 — xác suất thấp (chỉ khi Firebase lỗi/từ chối truy cập) nhưng tác động cao (mất hoàn toàn trần chi phí, LLM bị gọi không giới hạn). severity = Low, priority = P0.
**Vị trí chính:** `api/chat.js:735-830`

Khi Firebase GET không thành công, bộ đếm vẫn bằng 0. `conditionalPut()` trả `false` khi ghi lỗi nhưng kết quả không được kiểm tra. Exception cũng bị catch rồi request tiếp tục.

Harness đã tái hiện bốn request Firebase trả 401 trong khi chatbot vẫn hoàn tất bình thường.

**Khắc phục đề xuất:**

- Dùng storage hỗ trợ atomic increment/transaction phù hợp với serverless.
- Chỉ gọi LLM sau khi reserve quota thành công.
- Khi quota store lỗi, trả 503 hoặc chuyển sang chế độ suy giảm có giới hạn chặt.
- Await và kiểm tra kết quả cập nhật counter.
- Thêm provider-side budget cap làm lớp bảo vệ cuối.
- Alert khi tỷ lệ read/write limiter thất bại vượt ngưỡng.

## 4. Dependency và supply chain

`npm audit` tại thời điểm review báo 9 cảnh báo Moderate, không có High/Critical. Phần lớn nằm trong dependency tree của `firebase-admin`; không nên chạy `npm audit fix --force` một cách tự động vì đề xuất có thể hạ major version và tạo regression.

`index.html` đang dùng DOMPurify 3.0.6 và Marked 15.0.7 từ CDN. DOMPurify 3.0.6 thuộc phạm vi ảnh hưởng của các advisory XSS đã công bố. Chưa tái hiện được attack path đáng tin cậy qua lớp LLM, vì vậy không nâng thành finding độc lập, nhưng vẫn cần cập nhật khẩn cấp.

> **Đính chính so với bản review trước:** cả hai script CDN **đã được pin version chính xác và đã có `integrity` (SRI) + `crossorigin`** tại `index.html:258-259`. Vì vậy việc "khóa version" và "duy trì SRI" **về cơ bản đã hoàn tất** — không cần làm lại. Hành động thật sự còn lại chỉ là **nâng version** lên bản vá và cập nhật lại hash `integrity` tương ứng.

Khuyến nghị:

- Nâng DOMPurify (và rà Marked) lên bản vá mới nhất tương thích; cập nhật lại `integrity` hash sau khi đổi version.
- Nâng các dependency theo từng nhóm, chạy test trước khi merge.
- Bật Dependabot hoặc Renovate.
- Sinh SBOM và lưu kết quả audit trong CI.
- Giữ nguyên nguyên tắc pin version + SRI cho mọi script production thêm mới (đã áp dụng cho 2 script hiện tại).

## 5. Tính đúng đắn và độ tin cậy dữ liệu

### COR-01 - Tọa độ sai được thay bằng tọa độ ngẫu nhiên

**Mức ưu tiên:** P0 (combo với SEC-01)
**Vị trí:** `app.js:653-654` (`Math.random()`), khối parse 653-668

Khi không parse được tọa độ, ứng dụng tạo một vị trí ngẫu nhiên quanh một điểm mặc định (`lat = 21.325 + Math.random()*0.05`, `lng = 105.365 + Math.random()*0.05`). Điều này biến lỗi dữ liệu thành thông tin sai nhưng trông hợp lệ.

> **Combo với SEC-01.** Bản thân COR-01 đã là P1, nhưng khi kết hợp với SEC-01 (dữ liệu Form chưa duyệt được công khai), nó trở thành kênh tạo **trụ sở Công an giả ở tọa độ trông hợp lý**. Cặp SEC-01 + COR-01 phải ship cùng nhau ở P0; sửa một mình COR-01 (chặn tọa độ rác) đã loại bỏ được phần "trông hợp lý" của marker giả ngay cả trước khi luồng approval của SEC-01 hoàn thiện.

Yêu cầu sửa:

- Không tạo marker nếu tọa độ không hợp lệ.
- Kiểm tra phạm vi latitude/longitude và phạm vi địa lý mong đợi.
- Ghi nhận lỗi dữ liệu để quản trị xử lý.
- Hiển thị thống kê số bản ghi bị loại trong dashboard/admin log.

### COR-02 - Trạng thái tải dữ liệu không đầy đủ

**Vị trí:** `app.js:633-695`

Khi Google Sheet lỗi, mã chỉ `console.warn`; người dùng không có loading, retry, stale-data notice hoặc hướng dẫn xử lý.

Yêu cầu sửa:

- Có trạng thái loading, success, empty, stale và error.
- Cho phép retry thủ công.
- Cache last-known-good data và hiển thị thời điểm cập nhật.
- Theo dõi lỗi fetch bằng telemetry không chứa dữ liệu cá nhân.

### COR-03 - Hai đường đọc Google Sheet không thống nhất

Frontend hardcode Sheet ID và gọi Google trực tiếp tại `app.js:509-521`, trong khi `api/google-sheet.js` là proxy dùng `GOOGLE_SHEET_ID` nhưng không được frontend sử dụng.

Ngoài ra `vercel.json` đặt `Cache-Control: no-store` cho toàn bộ API, xung đột với cache `s-maxage=60` mà proxy dự định trả về.

Yêu cầu sửa:

- Chỉ giữ một đường đọc dữ liệu qua `/api/google-sheet`.
- Không coi việc giấu Sheet ID là security boundary; mục tiêu là kiểm soát schema, cache và lỗi.
- Tách cache policy cho API bản đồ và API chat.

## 6. Build, test và khả năng phát hành

### DEV-01 - Không có test tự động

`npm test` hiện luôn trả lỗi:

```text
Error: no test specified
```

Cần tối thiểu:

- Unit test cho parser Google Sheet, tọa độ, URL ảnh và filter.
- Unit test cho Turnstile, rate limit, logging minimization và RAG threshold.
- API integration test cho `/api/chat` và `/api/google-sheet`.
- Browser E2E cho tìm kiếm, filter, mở chi tiết, geolocation và chatbot.
- Accessibility smoke test bằng axe-core.

### DEV-02 - Build không kiểm tra sản phẩm

`npm run build` chỉ chạy `echo` và không compile Tailwind, kiểm tra syntax, lint hoặc kiểm tra output.

`tailwind.config.js` chỉ scan `./*.html` và `./*.js`, bỏ qua `./js/**/*.js`.

Build mới cần:

1. Compile/minify Tailwind.
2. Kiểm tra syntax/module.
3. Chạy lint.
4. Chạy unit/integration test.
5. Kiểm tra dependency và secret.
6. Tạo artifact tĩnh riêng thay vì dùng repository root làm `outputDirectory`.

### DEV-03 - Module format không nhất quán

`package.json` khai báo `"type": "commonjs"`, nhưng `api/google-sheet.js` dùng `export default`. Tệp này không qua `node --check` trong môi trường CommonJS.

Cần chuẩn hóa toàn bộ API theo một trong hai cách:

- CommonJS: `module.exports = async function handler(...)`.
- ESM: chuyển dự án/API sang ESM có kiểm thử đầy đủ.

Đối với phạm vi hiện tại, CommonJS là thay đổi nhỏ và phù hợp với `api/chat.js` hơn.

## 7. Hiệu năng

### PERF-01 - Marker không được clustering

145 marker đang được tạo ngay khi tải và add/remove theo từng lần filter. Trên mobile, marker chồng lấp làm bản đồ khó đọc.

Khuyến nghị:

- Dùng Leaflet.markercluster hoặc Supercluster.
- Chỉ render marker nằm trong viewport khi dữ liệu tăng lớn.
- Diff tập marker hiển thị thay vì quét/add/remove toàn bộ.
- Tách data model khỏi Leaflet marker instance.

### PERF-02 - Streaming Markdown có độ phức tạp tăng dần

Mỗi chunk gọi `renderMarkdown(rawText)` trong `requestAnimationFrame`, khiến toàn bộ câu trả lời được Marked parse và DOMPurify sanitize lại nhiều lần.

Khuyến nghị:

- Trong lúc stream chỉ nối text hoặc cập nhật theo nhịp 50-100 ms.
- Render Markdown đầy đủ một lần khi nhận event `done`.
- Hủy render pending khi request bị cancel/đóng.

### PERF-03 - Timeout không bao phủ thời gian đọc stream

`js/gemini.js:126` gọi `clearTimeout(timeoutId)` ngay sau khi nhận response headers. Nếu stream dừng giữa chừng, `reader.read()` có thể chờ vô hạn.

Khuyến nghị:

- Giữ timeout tới khi đọc xong stream.
- Có idle timeout riêng giữa hai chunk.
- Bổ sung nút Stop và `AbortController` cho người dùng.

### PERF-04 - Pipeline RAG tốn nhiều round trip

Một request có thể thực hiện embedding, truy vấn nhiều Pinecone namespace, retry không filter, rerank bằng Gemini và cuối cùng mới generate answer.

Khuyến nghị:

- Không thử nhiều namespace trong production; kiểm tra cấu hình lúc deploy.
- Bỏ rerank khi top score đủ cao.
- Đặt time budget cho từng giai đoạn.
- Cache embedding/query theo KB version.
- Ghi latency riêng cho embedding, retrieval, rerank và generation.

## 8. Giao diện và accessibility

### UI-01 - Danh sách kết quả không hỗ trợ bàn phím

Mỗi kết quả là `div.result-item`, không có `tabindex`, role hoặc xử lý Enter/Space. Kiểm tra DOM cho thấy 145 phần tử đều có `tabIndex=-1`.

Khắc phục:

- Dùng phần tử `button` trong danh sách, hoặc triển khai đầy đủ listbox semantics.
- Có focus-visible rõ ràng.
- Khi chọn kết quả, chuyển focus hợp lý sang panel chi tiết.

### UI-02 - Dialog chatbot thiếu quản lý focus

Chatbot có `role="dialog"` nhưng `aria-modal="false"`, không có Escape, focus trap hoặc trả focus về nút mở khi đóng.

Khắc phục:

- Chọn rõ mô hình non-modal popover hoặc modal dialog.
- Với mobile, dùng full-screen modal dưới breakpoint nhỏ.
- Hỗ trợ Escape, focus trap và focus restoration.
- Ẩn nút floating khi cửa sổ chat đang mở.

### UI-03 - Attribution OpenStreetMap bị tắt

`app.js` đặt `attributionControl: false` và CSS ẩn `.leaflet-control-attribution`. Cần bật lại attribution phù hợp với yêu cầu sử dụng dữ liệu OpenStreetMap.

### UI-04 - Nguồn chatbot chưa có khả năng kiểm chứng

Citation hiện chỉ là chip text, không có URL, ngày cập nhật hoặc nút mở văn bản chính thức.

Khắc phục:

- Mỗi nguồn cần URL đã allowlist tới cổng văn bản chính thức.
- Hiển thị tên văn bản, điều/khoản, ngày hiệu lực và ngày dữ liệu được cập nhật.
- Cho phép mở nguồn trong tab mới với `rel="noopener noreferrer"`.
- Không trả lời chắc chắn khi retrieval score thấp.

### UI-05 - Feedback chưa có tác dụng

Hai nút đánh giá chỉ khóa trạng thái UI, không gửi hoặc lưu feedback. Cần endpoint feedback riêng, không tự động gửi toàn bộ hội thoại và có rate limit.

## 9. Chất lượng câu trả lời chatbot

### AI-01 - Fallback dùng tài liệu dưới threshold

Khi không có match nào vượt `0.62`, mã vẫn lấy ba match đầu. Điều này làm mất ý nghĩa của threshold và tăng nguy cơ trả lời dựa trên tài liệu không liên quan.

Khuyến nghị:

- Nếu score dưới ngưỡng, trả lời không tìm thấy nguồn đủ tin cậy.
- Cung cấp đường dẫn liên hệ hoặc cơ quan có thẩm quyền.
- Đo groundedness và citation correctness bằng bộ câu hỏi đánh giá cố định.

### AI-02 - Cache câu trả lời pháp lý chưa có version dữ liệu

Cache theo câu hỏi có thể trả lại nội dung cũ sau khi knowledge base hoặc system prompt thay đổi.

Khuyến nghị:

- Cache key phải chứa `kb_version`, `prompt_version`, model và language.
- TTL ngắn hơn cho dữ liệu pháp lý.
- Có cơ chế purge khi cập nhật văn bản.
- Không cache câu hỏi có dấu hiệu chứa dữ liệu cá nhân.

### AI-03 - Chưa gắn kết tốt với sản phẩm bản đồ

Chatbot hiện thiên về pháp luật xuất nhập cảnh trong khi sản phẩm chính là bản đồ công an. Nên ưu tiên các use case liên kết hai phần:

- Tìm đơn vị gần nhất theo vị trí.
- Hỏi nơi thực hiện thủ tục và mở marker tương ứng.
- Kiểm tra giờ làm việc, số điện thoại và tuyến đường.
- Hướng dẫn thủ tục kèm nguồn chính thức và địa điểm tiếp nhận.

## 10. Cấu hình Vercel và Cloudflare Turnstile

Không nên chỉ sao chép toàn bộ biến môi trường từ dự án khác mà không phân loại. Secret phải thuộc đúng project/resource production của `bandocapt`.

Các nhóm biến hiện được mã sử dụng:

| Nhóm | Biến |
| --- | --- |
| LLM | `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` |
| Pinecone | `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `PINECONE_INDEX_HOST`, `PINECONE_NAMESPACE` |
| Firebase Admin | `FIREBASE_SERVICE_ACCOUNT_JSON` hoặc bộ `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` |
| Firebase legacy | `FIREBASE_DB_URL`, `FIREBASE_DB_SECRET` |
| Chat logging | `FIRESTORE_CHAT_COLLECTION`, `CHAT_LOG_HASH_SALT` |
| Turnstile | `TURNSTILE_SECRET_KEY` |
| Origin | `ALLOWED_ORIGINS` |
| Google Sheet | `GOOGLE_SHEET_ID` |
| Test-only | `EVAL_BYPASS_TOKEN` |

Yêu cầu cấu hình:

- Tạo Turnstile widget riêng cho domain của `bandocapt`.
- Site key là public nhưng phải thuộc đúng widget; secret chỉ lưu trên Vercel.
- Không dùng production secret trong local hoặc test.
- `EVAL_BYPASS_TOKEN` không được có trong Production.
- Cấu hình và kiểm tra riêng cho Production, Preview và Development.
- Xoay vòng mọi credential từng được dùng chung hoặc để trong dự án cũ.

## 11. Kết quả xác minh

| Kiểm tra | Kết quả |
| --- | --- |
| Frontend desktop/mobile | Hoạt động, không có browser console error trong luồng đã kiểm tra |
| JavaScript runtime chính | `api/chat.js`, `app.js`, `js/chatbot.js`, `js/gemini.js` qua syntax check |
| Google Sheet API | Không qua local CommonJS syntax check do dùng `export default` |
| `npm run build` | Thành công nhưng chỉ chạy `echo`, chưa tạo/kiểm tra artifact |
| `npm test` | Thất bại có chủ đích vì chưa có test |
| `npm audit` | 9 Moderate, 0 High, 0 Critical tại thời điểm review |
| Security coverage | 20/20 tệp trong scope đã có receipt hoàn tất |

## 12. Giới hạn của review

- Không truy cập cấu hình production thực tế trên Vercel, Firebase, Google Workspace, Pinecone hoặc Cloudflare.
- Không kiểm tra ACL/retention thực tế của RTDB và Firestore.
- Không gửi dữ liệu thử nghiệm vào production Google Form hoặc Google Sheet.
- Không chạy load test với traffic thật.
- Không xác minh tính chính xác pháp lý của toàn bộ knowledge base.

## 13. Thứ tự ưu tiên tổng hợp

### P0 - Trước lần triển khai production tiếp theo

1. **Combo SEC-01 + COR-01:** tách dữ liệu Google Form khỏi dữ liệu công khai **VÀ** loại bỏ tọa độ ngẫu nhiên (chặn marker giả ở vị trí trông hợp lý). Phần "bỏ `Math.random()`" là fix nhẹ, làm ngay; luồng staging/approval tách sprint riêng nhưng vẫn thuộc P0.
2. Ngừng lưu nội dung hội thoại và IP thô; xóa fallback RTDB hardcode.
3. Turnstile fail-closed và xác thực cấu hình khi deploy (Low severity / P0 priority).
4. Rate limit atomic, không tiếp tục gọi LLM khi quota store lỗi (Low severity / P0 priority).
5. Nâng version DOMPurify (+ rà Marked) và cập nhật lại `integrity` hash. _Pin version + SRI đã có sẵn — chỉ cần bump._

> **Gợi ý lát cắt "đòn bẩy cao / công sức thấp"** có thể làm trong ~1 ngày, chặn ngay rủi ro lớn nhất: (a) Turnstile fail-closed ~5 dòng; (b) await + kiểm tra kết quả rate limit, store lỗi → 503; (c) bỏ `Math.random()`, tọa độ không hợp lệ → không tạo marker ~3 dòng; (d) bump DOMPurify + hash. Phần staging/approval (SEC-01) và test/CI là hạng mục nặng, tách riêng.

### P1 - Sprint kế tiếp

1. Hoàn thiện data validation tọa độ (range lat/lng, bounding box) — phần còn lại của COR-01 sau khi đã bỏ random ở P0.
2. Chuẩn hóa API Google Sheet và cache policy.
3. Xây dựng test/CI/build thật.
4. Thêm marker clustering và tối ưu streaming.
5. Sửa accessibility của kết quả, panel và chatbot.

### P2 - Nâng cấp sản phẩm

1. Citation có URL chính thức và thông tin hiệu lực.
2. Feedback có backend và dashboard tổng hợp.
3. Chatbot tìm trụ sở gần nhất và liên kết trực tiếp với bản đồ.
4. Versioned RAG cache, evaluation suite và theo dõi groundedness.
5. Cải thiện trạng thái offline/stale/error và quan sát vận hành.
