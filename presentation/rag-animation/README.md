# RAG Slide Animation

Motion graphic Remotion (React + TypeScript), **không âm thanh**, minh họa quy trình
chatbot RAG xử lý một câu hỏi — dùng để chèn vào slide PowerPoint.

- Composition: `RagSlideAnimation`
- Kích thước: 1920×1080 (16:9)
- Thời lượng: 720 frame @ 30fps = 24 giây
- Vòng lặp liền mạch: toàn bộ nội dung mờ dần về khung nền trống trong ~50 frame
  cuối, khớp với trạng thái trống ở frame 0 → phát lặp lại không bị giật.
- Không có `<Audio>`/`<OffthreadVideo>` nào được dùng → file MP4 xuất ra mặc định
  không có track âm thanh.

## Cài đặt

```bash
cd presentation/rag-animation
npm install
```

## Xem trước (Remotion Studio)

```bash
npm start
```

Mở Remotion Studio, chọn composition `RagSlideAnimation`, tua đến bất kỳ frame nào
để xem trước (khuyến nghị kiểm tra các frame 0, 120, 240, 360, 480, 600, 719).

## Render MP4 (H.264, không âm thanh)

```bash
npm run render
```

Tương đương lệnh đầy đủ:

```bash
npx remotion render src/index.ts RagSlideAnimation out/RagSlideAnimation.mp4 \
  --codec=h264 \
  --pixel-format=yuv420p \
  --crf=18 \
  --muted
```

File xuất ra tại `out/RagSlideAnimation.mp4`. `--crf=18` cho chất lượng cao (gần
lossless, phù hợp chiếu trên màn lớn); có thể tăng lên 20–23 nếu cần file nhẹ hơn.
`--muted` bắt buộc phải có: composition không dùng `<Audio>` nên bản thân video đã
"câm", nhưng nếu thiếu cờ này Remotion vẫn mux một track AAC câm lặng vào container
MP4 (im lặng thật sự, không phải tiếng ồn) — dùng `--muted` để bỏ hẳn track âm thanh
khỏi file, đúng yêu cầu "không có âm thanh" ở mức container chứ không chỉ ở mức nội dung.

## Xuất ảnh tĩnh để kiểm tra từng frame

```bash
npx remotion still src/index.ts RagSlideAnimation out/frame-0.png --frame=0
npx remotion still src/index.ts RagSlideAnimation out/frame-360.png --frame=360
```

Các frame đại diện đã được kiểm tra trong quá trình phát triển: `0, 120, 240, 360,
480, 600, 719` — không tràn chữ, không đè chữ, đúng vùng an toàn 80px.

## Chèn vào PowerPoint

1. Insert → Video → This Device… → chọn `out/RagSlideAnimation.mp4`.
2. Chọn video vừa chèn → tab **Playback** → tick **Loop until Stopped** (và **Rewind
   after Playing** nếu muốn) để lặp video liên tục khi trình chiếu.
3. Vì video không có âm thanh, không cần thao tác gì thêm về audio.

## Cấu trúc project

```
src/
  index.ts              — registerRoot
  Root.tsx              — dang ky composition "RagSlideAnimation"
  RagSlideAnimation.tsx — dan canh chinh (6 canh, xem comment dau file)
  theme.ts               — mau sac + font
  geometry.ts             — toa do panel/node + toan hoc Bezier dung chung
  data.ts                 — noi dung cau hoi/tra loi/tai lieu/trich dan (vi du minh hoa)
  icons.tsx                — bo icon SVG flat
  load-font.ts              — nap font Be Vietnam Pro (co dau tieng Viet)
  components/
    ChatWindow.tsx         — khung chat mo phong (khu trai)
    UserQuestion.tsx        — bong tin nhan nguoi dung
    RagNode.tsx              — card node pipeline dung chung
    KnowledgeDocument.tsx     — the tai lieu trong kho ngu lieu
    MovingDataPacket.tsx       — goi du lieu di chuyen theo duong Bezier
    RetrievalBeam.tsx           — duong noi SVG co mui ten
    ContextBuilder.tsx           — card lap ghep ngu canh
    LlmProcessor.tsx               — node mo hinh ngon ngu (hieu ung "tho")
    SourceCitation.tsx             — chip trich dan nguon
```

## Ghi chú kỹ thuật

- Mọi chuyển động tính thuần theo `frame` (qua `useCurrentFrame()`, `interpolate()`,
  `spring()`) — không dùng CSS animation/transition hay `setTimeout`, đảm bảo kết quả
  render ổn định, giống hệt nhau ở mọi lần render lại cùng một frame.
- Các đường nối (`RetrievalBeam`) và gói dữ liệu (`MovingDataPacket`) dùng chung một
  hàm toán Bezier bậc 2 thuần túy (`geometry.ts`) — không phụ thuộc `ref`/DOM
  (`getPointAtLength`) nên không có rủi ro sai lệch giữa các lần render frame-by-frame.
- Nội dung câu hỏi/trả lời/tài liệu trong `data.ts` chỉ mang tính minh họa quy trình,
  không phải nội dung tư vấn chính thức của hệ thống.
