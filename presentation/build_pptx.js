/**
 * build_pptx.js — Template dựng slide thuyết trình (theme glassmorphism).
 *
 * Cài đặt (lần đầu):
 *   npm install pptxgenjs jszip            # bắt buộc
 *   npm install react react-dom sharp react-icons   # tùy chọn — để có icon
 *
 * Chạy:   node build_pptx.js
 *
 * CÁCH DÙNG: chỉ sửa 2 khối CONFIG và CONTENT ở đầu file cho khớp dự án.
 * Các hàm dựng slide bên dưới dùng lại được, không cần đụng tới.
 *
 * Nếu thiếu react/sharp/react-icons → script vẫn chạy, chỉ bỏ phần icon.
 */

"use strict";
const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");

// ============================================================ CONFIG
const CONFIG = {
  outFile: "Ban-do-Cong-an-so-Phu-Tho.pptx",
  author: "Câu lạc bộ sáng tạo",
  title: "Bản đồ Công an số tỉnh Phú Thọ",
  shotsDir: path.join(__dirname, "shots"), // thư mục ảnh chụp UI (có thể rỗng)
  font: "Segoe UI",
};

// Bảng màu — đổi nhận diện ở đây (xem reference/design-system.md)
//
// KỶ LUẬT MÀU (áp redesign-skill / minimalist-skill): CHỈ 2 màu mang nghĩa —
//   · deep navy  = màu thương hiệu, dùng cho nền tối + khối icon
//   · teal       = accent DUY NHẤT, chỉ dùng cho nghĩa "đã xác minh / tích cực / khắc phục"
// Trước đây deck có 5 accent (blue + green + lime + đỏ + cam) khiến slide bị ồn.
// Các key cũ (green/lime/danger/warn) giữ lại làm ALIAS trỏ về accent mới để
// không vỡ các slide đang tham chiếu tên màu cũ trong CONTENT.
const ACCENT = "0B7A75"; // teal — trùng màu icon `icTeal` bên dưới
const THEME = {
  deep: "1e3a8a", deep2: "1e40af", primary: "1d4ed8",
  teal: ACCENT, green: ACCENT, lime: ACCENT, danger: ACCENT, warn: ACCENT, // alias -> 1 accent
  mintTxt: "dbeafe", mint2: "eff6ff",
  paper: "FFFFFF", ink: "0f172a", slate: "334155", muted: "64748b",
  cardBg: "f8fafc", cardBd: "e2e8f0", tealBg: "EAF6F5",
  // Card trên nền tối: dùng navy ĐẬM CÙNG HỌ với nền (1e3a8a) thay vì teal-đậm
  // 0E4A44 như trước — tránh trộn hai họ màu trên cùng một slide.
  cardDark: "16306E",
};

// ============================================================ CONTENT
const CONTENT = {
  title: {
    type: "title",
    kicker: "CÔNG TRÌNH CÂU LẠC BỘ SÁNG TẠO",
    title: "BẢN ĐỒ CÔNG AN SỐ",
    subtitle: "Tỉnh Phú Thọ",
    chips: ["Dành cho công dân", "AI Tư vấn tự động", "Bản đồ tương tác"],
    author: CONFIG.author,
    icon: "shield",
    notes: "Kính thưa các đồng chí Lãnh đạo Công an tỉnh, hôm nay tôi xin đại diện trình bày công trình ra mắt Câu lạc bộ sáng tạo: Bản đồ Công an số tỉnh Phú Thọ. Xin phép bắt đầu bài trình bày bằng một thực tế hằng ngày mà tất cả chúng ta đều gặp.",
  },
  slides: [
    {
      type: "bigStat", dark: true,
      // KHÔNG nêu con số ("hàng ngàn giờ") vì chưa có thống kê chính thức để dẫn.
      // Giữ nguyên sức nặng của vấn đề bằng diễn đạt định tính + ghi rõ nguồn quan sát.
      kicker: "Thực trạng", stat: "Lặp lại",
      statSub: "Cùng một câu hỏi thủ tục, giải đáp nhiều lần mỗi ngày",
      items: ["Người dân loay hoay tìm địa chỉ đúng", "Đi lại nhiều lần vì sai thủ tục", "Cán bộ mất thời gian trả lời lặp lại"],
      icon: "hourglass",
      footer: "Ghi nhận từ thực tế công tác, chưa có số liệu thống kê chính thức.",
      notes: "Thưa các đồng chí, từ thực tế công tác chúng ta đều thấy một điều: cùng một câu hỏi về thủ tục được hỏi đi hỏi lại rất nhiều lần. Người dân thì loay hoay tìm đúng trụ sở, mất công đi lại vì chuẩn bị sai giấy tờ. Cán bộ thì mất thời gian trả lời những câu giống hệt nhau. Tôi xin lưu ý đây là ghi nhận từ quan sát thực tế, chưa phải số liệu thống kê chính thức, nên tôi không nêu con số cụ thể.",
    },
    {
      type: "quote",
      text: "Người dân cần được hướng dẫn chính xác\ntrước khi đến làm thủ tục.",
      showQuoteMarks: false,
      author: "Nhu cầu thường gặp của người dân",
      notes: "Từ thực tế công tác, có thể thấy người dân cần được hướng dẫn chính xác trước khi đến làm thủ tục. Đây là một nhận định khái quát, không phải trích dẫn nguyên văn của một trường hợp cụ thể. Chính nhu cầu đó đã thôi thúc tôi bắt tay nghiên cứu.",
    },
    {
      type: "showcase",
      kicker: "Cú hích giải pháp", title: "Bản đồ Công an số",
      lead: "Một điểm chạm để người dân tra cứu đúng nơi và hỏi đúng thủ tục.",
      features: [
        ["search", "Bản đồ tương tác", "Định vị mạng lưới trụ sở trên nền OpenStreetMap."],
        ["user360", "Trợ lý ảo AI", "Tư vấn thủ tục hành chính, giải đáp 24/7."],
      ],
      image: path.join(__dirname, "asset", "giao dien desktop.png"),
      caption: "Giao diện thử nghiệm trên máy tính",
      notes: "Và đó là lý do Bản đồ Công an số ra đời. Nó không chỉ là một cái bản đồ khô khan. Nó là sự kết hợp giữa bản đồ định vị chính xác mọi trụ sở, và một Trợ lý ảo AI hiểu luật, túc trực 24/7 để tư vấn thủ tục cho dân.",
    },
    {
      type: "hero", transition: "morph",
      // KHÔNG dùng cam kết tuyệt đối ("không bao giờ nói dối"): mâu thuẫn với
      // slide Hạn chế và với trạng thái thật của hệ thống (governance/abstention
      // chưa bật ở production). Nói đúng mức độ: giảm rủi ro, không loại trừ.
      size: 44,
      text: "Giảm rủi ro trả lời sai\nbằng dữ liệu có kiểm soát\nvà hậu kiểm.",
      notes: "Thưa các đồng chí, dùng AI thì lo nhất là AI bịa chuyện. Tôi không dám khẳng định hệ thống đúng tuyệt đối, vì như vậy là không trung thực. Điều tôi xin báo cáo là: hệ thống được thiết kế để GIẢM RỦI RO trả lời sai, bằng hai nguyên tắc — chỉ dựa trên kho dữ liệu có kiểm soát, và có bước hậu kiểm trước khi hiển thị cho người dân.",
    },
    {
      type: "steps",
      kicker: "Cách tiếp cận kỹ thuật", title: "4 lớp kiểm soát giảm rủi ro trả lời sai",
      lead: "Không có phép màu — đây là quy trình kiểm soát gồm 4 lớp, mỗi lớp chặn một kiểu sai khác nhau:",
      // Tiêu đề bước để NGẮN (<= ~18 ký tự) để không xuống 2 dòng làm chồng chữ.
      // Mô tả tránh khẳng định tuyệt đối ("chỉ lấy", "luôn từ chối") vì lớp 1 và
      // lớp 3 hiện mới chạy trên bản thử nghiệm — xem dòng trạng thái phía dưới.
      steps: [
        ["search", "Truy hồi có kiểm soát", "Ưu tiên nguồn đã qua rà soát nội bộ, đúng thẩm quyền và cấp thực hiện."],
        ["layers", "AI chấm điểm lại", "Mô hình thứ hai rà soát, loại tài liệu gần giống nhưng sai ngữ cảnh."],
        // Mô tả giữ <= ~65 ký tự: dài hơn sẽ tràn khỏi thẻ (đã đo bằng mock 1:1).
        ["balance", "Bám theo căn cứ", "Bám tài liệu truy hồi được; thiếu căn cứ thì báo không đủ cơ sở."],
        ["shield", "Hậu kiểm", "Đối chiếu số điện thoại, địa chỉ, căn cứ pháp lý với nguồn."],
      ],
      // Dòng trạng thái BẮT BUỘC: production hiện vẫn chạy cấu hình cũ
      // (namespace `chatbot-tthc-xnc`, đã rollback 2026-07-17); `RAG_GOVERNANCE_FILTER` và
      // `RAG_FAIL_CLOSED` mặc định TẮT — xem docs/brain/04-current-tasks.md.
      // LƯU Ý (đừng đơn giản hoá thành "vướng quota Gemini"): rollback 17/07 do HAI lý do
      // cùng lúc — quota Gemini 429 VÀ một hard-fail NỘI DUNG thật (lỗi logic nhận diện intent,
      // không phải lỗi nhà cung cấp AI) — 03-decisions.md dòng "T3.8 — Current-procedure-first".
      // Sau khi vá lỗi nội dung, gate đã chạy lại bằng DeepSeek (`LLM_PRIMARY=deepseek`) và
      // ĐẠT xanh ngày 2026-07-18 (majority 2/3, 0 hard-fail đa số) — 04-current-tasks.md dòng
      // "Cập nhật T3.8 ngày 2026-07-18". Tức là đến thời điểm đó KHÔNG còn vướng kỹ thuật; việc
      // chưa cutover production chỉ còn là QUYẾT ĐỊNH CON NGƯỜI chưa được đưa ra, không phải do
      // hạ tầng AI. Nếu sau này bật cờ thật, sửa `status` bên dưới và xoá cảnh báo P0 tương ứng.
      status: "Hiện trạng: lớp 2, 4 đang hoạt động; lớp 1, 3 đã kiểm thử đạt trên bản thử nghiệm, sẵn sàng áp dụng, đang chờ phê duyệt.",
      notes: "Để giảm rủi ro trả lời sai, hệ thống được thiết kế gồm bốn lớp kiểm soát nối tiếp nhau. Lớp một: truy hồi có kiểm soát, ưu tiên nguồn đã qua rà soát nội bộ, đúng thẩm quyền, đúng cấp thực hiện, tránh lẫn quy định cấp xã với cấp tỉnh. Lớp hai: dùng chính một AI khác chấm điểm, xếp hạng lại kết quả, loại bỏ tài liệu gây nhiễu. Lớp ba: câu trả lời phải bám theo tài liệu truy hồi được, nếu không đủ căn cứ thì báo không đủ cơ sở thay vì suy diễn. Lớp bốn: trước khi hiển thị, một bước hậu kiểm tự động đối chiếu lại từng số điện thoại, địa chỉ, căn cứ pháp lý với nguồn. Ở đây tôi xin báo cáo rõ hiện trạng để các đồng chí nắm đúng: lớp hai và lớp bốn hiện đã hoạt động. Lớp một và lớp ba đã kiểm thử đạt trên bản thử nghiệm, sẵn sàng để áp dụng — chỉ còn chờ phê duyệt để bật trên bản chạy chính thức. Đây chính là một trong những nội dung tôi xin kiến nghị ở phần sau.",
    },
    {
      type: "video",
      kicker: "Minh hoạ", title: "Quy trình xử lý một câu hỏi",
      // Đường dẫn tương đối tới MP4 do project Remotion `rag-animation` render ra.
      // Nếu file chưa tồn tại, factory sẽ dựng khung giữ chỗ thay vì làm hỏng build.
      path: path.join(__dirname, "rag-animation", "out", "RagSlideAnimation.mp4"),
      caption: "Video minh hoạ — nội dung câu hỏi và câu trả lời là ví dụ, không phải tư vấn chính thức.",
      notes: "Đây là video minh hoạ quy trình hệ thống xử lý một câu hỏi của người dân: từ lúc tiếp nhận câu hỏi, truy hồi tài liệu, chọn lọc đúng tài liệu có thẩm quyền, cho tới khi sinh câu trả lời kèm trích dẫn nguồn. Tôi xin lưu ý, nội dung câu hỏi và câu trả lời trong video chỉ là ví dụ để minh hoạ luồng xử lý, không phải nội dung tư vấn chính thức. Video không có âm thanh, các đồng chí có thể vừa xem vừa nghe tôi trình bày.",
    },
    {
      type: "mobileShowcase",
      kicker: "Tính năng vượt trội", title: "Phục vụ nhân dân địa phương",
      features: [
        // Một màu icon duy nhất cho cả lưới: khác biệt đến từ hình icon + nhãn,
        // không phải từ 4 màu khác nhau (redesign-skill: "pick one accent").
        ["users", "deep", "Thân thiện dễ dùng", "Giao diện tối giản, tối ưu cho điện thoại di động."],
        ["flag", "deep", "Hỗ trợ Ngoại ngữ", "Dịch Tiếng Anh/Trung/Hàn cho người nước ngoài."],
        ["cloud", "deep", "Quản trị linh hoạt", "Cán bộ cập nhật dữ liệu tự động qua Google Sheets."],
        ["shield", "deep", "Bảo mật", "Ngăn chặn tấn công bằng hệ thống Cloudflare Turnstile."]
      ],
      images: [
        path.join(__dirname, "asset", "chat bot tra loi.png"),
        path.join(__dirname, "asset", "tra cuu thu tục tren dien thoai.png"),
      ],
      notes: "Hệ thống cực kỳ thân thiện với người dân địa phương qua giao diện điện thoại. Ngoài ra, để hỗ trợ hội nhập, nó còn bổ sung tính năng đa ngôn ngữ. Về phía cán bộ, việc quản trị cũng cực kỳ đơn giản qua Google Sheets.",
    },
    {
      type: "result", dark: true, transition: "morph",
      kicker: "Giá trị mang lại", title: "Giá trị có thể đo kiểm",
      cards: [
        // "VẠN NGƯỜI" là con số chưa có căn cứ -> nêu đặc tính có thật, kiểm chứng được.
        ["users", "teal", "24/7", "Tra cứu được ngoài giờ hành chính, không phải chờ tới lượt."],
        // Latency THẬT theo nhật ký đo kiểm (06-ai-working-log 2026-07-13):
        // p95 ≈ 17,0 giây khi chạy Gemini; ≈ 28,2 giây khi phải chuyển sang DeepSeek.
        // Bản trước ghi "VÀI GIÂY" là SAI so với số đo -> sửa và ghi rõ điều kiện đo.
        ["clock", "teal", "17–28 GIÂY", "Thời gian phản hồi p95 đo trong kiểm thử nội bộ, tuỳ nhà cung cấp AI."],
      ],
      footer: "Số liệu từ kiểm thử nội bộ, chưa phải số liệu vận hành thực tế trên diện rộng.",
      notes: "Về giá trị mang lại: thứ nhất, hệ thống phục vụ 24/7, người dân tra cứu được cả ngoài giờ hành chính mà không phải chờ tới lượt. Thứ hai, về tốc độ, tôi xin báo cáo đúng số đo: thời gian phản hồi p95 trong kiểm thử nội bộ khoảng 17 giây, và có thể lên tới khoảng 28 giây khi hệ thống phải chuyển sang nhà cung cấp AI dự phòng. Tôi nói rõ đây là số đo trong kiểm thử, chưa phải số liệu vận hành thực tế trên diện rộng. Đổi lại, dự án cần chi phí đầu tư hạ tầng máy chủ và API.",
    },
    {
      type: "limitations",
      kicker: "Điều kiện triển khai", title: "Ba điều kiện để vận hành hiệu quả",
      // Giữ lead trong MỘT dòng (<= ~120 ký tự ở 14.5pt / bề ngang 11.9in);
      // dài hơn sẽ xuống dòng và đè lên nhãn cột bên dưới.
      // Câu tự nhận khiêm tốn ("không chuyên công nghệ, tự nghiên cứu") KHÔNG đặt
      // trên slide (quá dài + hạ uy tín trên màn chiếu) mà chỉ NÓI trong lời đọc.
      lead: "Sản phẩm đã hoạt động. Để vận hành hiệu quả và bền vững, công trình cần ba sự phối hợp rõ ràng.",
      leftLabel: "Bên phối hợp",
      rightLabel: "Nội dung phối hợp",
      // Tái khung từ "5 hạn chế" sang "3 điều kiện" (quyết định người dùng 2026-07-21):
      // giọng tự tin hơn, đồng thời VÁ mâu thuẫn CNTT với slide 11 — Câu lạc bộ vẫn
      // trực tiếp vận hành, đơn vị CNTT chỉ HỖ TRỢ (không còn "bố trí người tiếp nhận").
      // Ý "AI vẫn có thể sai" gộp vào điều kiện 2 (hậu kiểm chuyên môn), không bỏ.
      pairs: [
        [
          "Câu lạc bộ Sáng tạo",
          "Trực tiếp phụ trách kỹ thuật và vận hành; đề nghị đơn vị CNTT hỗ trợ khi có việc chuyên sâu.",
        ],
        [
          "Đơn vị nghiệp vụ",
          "Rà soát, phê duyệt và cập nhật nội dung; hậu kiểm chuyên môn vì AI vẫn có thể trả lời sai.",
        ],
        [
          "Cán bộ tiếp công dân",
          "Bổ sung tình huống thực tế và những câu hỏi người dân thường gặp ngay tại quầy.",
        ],
      ],
      notes:
        "Kính thưa các đồng chí, sản phẩm đã hoạt động được, nhưng để vận hành hiệu quả và bền vững thì một mình tôi không thể làm hết. Tôi xin thẳng thắn: bản thân tôi vừa không chuyên về công nghệ, vừa không phải người trực tiếp tiếp công dân hằng ngày — đây là công trình tôi tự mày mò nghiên cứu theo góc nhìn cá nhân. Chính vì vậy, tôi xin đề xuất ba điều kiện phối hợp. Thứ nhất, về kỹ thuật: Câu lạc bộ Sáng tạo xin được trực tiếp phụ trách vận hành hệ thống; khi có vấn đề công nghệ chuyên sâu thì kính đề nghị đơn vị công nghệ thông tin hỗ trợ. Thứ hai, về nội dung: kính đề nghị đơn vị nghiệp vụ rà soát, phê duyệt và cập nhật nội dung; đây cũng là bước hậu kiểm quan trọng, bởi bản chất AI vẫn có thể trả lời sai nên rất cần con người kiểm soát. Thứ ba, về thực tế: kính mong các đồng chí cán bộ trực tiếp tiếp công dân bổ sung những tình huống thật và những câu người dân hay hỏi ngay tại quầy. Và trên hết, chúng tôi xác định làm từng bước — thí điểm ở phạm vi hẹp, đánh giá kết quả, rồi mới nhân rộng — để mọi rủi ro đều nằm trong tầm kiểm soát.",
    },
    {
      type: "conclusion", dark: true,
      kicker: "Tầm nhìn thiết thực", title: "Một chính quyền số gần dân",
      bullets: [
        "Hoàn thiện hệ sinh thái dịch vụ công thông minh.",
        "Xây dựng hình ảnh Công an Phú Thọ hiện đại, tận tụy.",
      ],
      askTitle: "KÍNH ĐỀ NGHỊ LÃNH ĐẠO CÔNG AN TỈNH",
      // Kiến nghị bám đúng lộ trình đã nêu ở slide "Hạn chế": thí điểm trước,
      // nhân rộng sau — tránh mâu thuẫn giữa hai slide liền nhau.
      asks: [
        // Kiến nghị 1 nối thẳng với dòng trạng thái ở slide "4 lớp kiểm soát":
        // hai lớp đã kiểm thử đạt nhưng chưa được bật ở bản chạy chính thức.
        "Cho phép thí điểm với cấu hình kiểm soát đã kiểm thử",
        "Giao đơn vị nghiệp vụ thẩm định nội dung kho dữ liệu",
        "Bố trí cán bộ CNTT và kinh phí duy trì hạ tầng hằng năm",
      ],
      thanks: "Xin trân trọng cảm ơn các đồng chí Lãnh đạo!",
      icon: "shield",
      notes: "Kính thưa các đồng chí Lãnh đạo, đây không chỉ là một phần mềm, đây là viên gạch góp phần xây dựng hình ảnh chính quyền số gần dân. Trên tinh thần cầu thị vừa báo cáo, tôi kính đề nghị Lãnh đạo Công an tỉnh ba nội dung. Một là, cho phép triển khai thí điểm với cấu hình kiểm soát đã kiểm thử, đánh giá kết quả rồi mới tiến tới nhân rộng. Hai là, giao đơn vị nghiệp vụ thẩm định nội dung kho dữ liệu để bảo đảm tính chính xác về pháp lý. Ba là, quan tâm bố trí cán bộ công nghệ thông tin và kinh phí duy trì hạ tầng hằng năm, để hệ thống phục vụ nhân dân được lâu dài. Xin trân trọng cảm ơn các đồng chí.",
    }
  ]
};

// ============================================================ ICONS (optional)
let React, ReactDOMServer, sharp, FA;
let ICONS_OK = true;
try {
  React = require("react");
  ReactDOMServer = require("react-dom/server");
  sharp = require("sharp");
  FA = require("react-icons/fa");
} catch (e) {
  ICONS_OK = false;
  console.warn("[icon] Thiếu react/sharp/react-icons — bỏ qua icon. Cài để có icon đẹp.");
}
const FA_MAP = ICONS_OK ? {
  shield: FA.FaShieldAlt, db: FA.FaDatabase, search: FA.FaSearchPlus, idcard: FA.FaIdCard,
  sync: FA.FaSyncAlt, user360: FA.FaUserShield, chart: FA.FaChartBar, lock: FA.FaLock,
  plug: FA.FaPlug, userlock: FA.FaUserLock, audit: FA.FaClipboardList, cap: FA.FaGraduationCap,
  check: FA.FaCheckCircle, alert: FA.FaExclamationTriangle, clock: FA.FaClock, coins: FA.FaCoins,
  copy: FA.FaCopy, hourglass: FA.FaHourglassHalf, layers: FA.FaLayerGroup, users: FA.FaUsers,
  excel: FA.FaFileExcel, eyeslash: FA.FaEyeSlash, seedling: FA.FaSeedling, flag: FA.FaFlag,
  arrow: FA.FaArrowRight, balance: FA.FaBalanceScale, trendUp: FA.FaArrowUp,
  cloud: FA.FaCloudUploadAlt, video: FA.FaPlayCircle,
} : {};

async function renderIcon(key, color, size = 256) {
  if (!ICONS_OK || !FA_MAP[key]) return null;
  const svg = ReactDOMServer.renderToStaticMarkup(
    React.createElement(FA_MAP[key], { color, size: String(size) })
  );
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + png.toString("base64");
}

// ============================================================ TRANSITIONS
// pptxgenjs không ghi <p:transition>; ta mở file zip và chèn tay vào XML.
const MC = 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
const P159 = 'xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/9/main"';
const P14 = 'xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"';
const morphXml = (dur) =>
  `<mc:AlternateContent ${MC}><mc:Choice ${P159} Requires="p159">` +
  `<p:transition ${P14} spd="med" p14:dur="${dur}"><p159:morph option="byObject"/></p:transition>` +
  `</mc:Choice><mc:Fallback><p:transition spd="med"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>`;
const fadeXml = (dur) =>
  `<p:transition ${P14} spd="med" p14:dur="${dur}"><p:fade/></p:transition>`;

async function applyTransitions(file, morphSet) {
  let JSZip;
  try { JSZip = require("jszip"); }
  catch (e) { console.warn("[transition] Thiếu jszip — bỏ qua hiệu ứng chuyển slide."); return { nMorph: 0, nFade: 0 }; }
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  let nMorph = 0, nFade = 0;
  for (const name of slides) {
    const num = parseInt(name.match(/slide(\d+)\.xml/)[1], 10);
    let xml = await zip.file(name).async("string");
    if (/<p:transition|p159:morph/.test(xml)) continue;
    const isMorph = morphSet.includes(num);
    xml = xml.replace("</p:sld>", (isMorph ? morphXml(800) : fadeXml(450)) + "</p:sld>");
    zip.file(name, xml);
    isMorph ? nMorph++ : nFade++;
  }
  fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  return { nMorph, nFade };
}

// ============================================================ BUILD
async function main() {
  const C = THEME, HF = CONFIG.font, BF = CONFIG.font;
  const PW = 13.3, M = 0.7;

  // Tải sẵn icon trắng + icon teal cho mọi key được dùng
  const usedKeys = new Set();
  const collect = (o) => {
    if (!o) return;
    if (o.icon) usedKeys.add(o.icon);
    (o.cards || []).forEach((c) => usedKeys.add(c[0]));
    (o.steps || []).forEach((c) => usedKeys.add(c[0]));
    // Slide `limitations` không khai icon theo từng dòng — nó luôn dùng 2 icon cố định.
    if (o.pairs) { usedKeys.add("check"); usedKeys.add("arrow"); }
  };
  collect(CONTENT.title);
  CONTENT.slides.forEach(collect);
  const ic = {}, icTeal = {};
  for (const k of usedKeys) { ic[k] = await renderIcon(k, "#FFFFFF"); icTeal[k] = await renderIcon(k, "#" + ACCENT); }

  const p = new pptxgen();
  p.defineLayout({ name: "WIDE", width: PW, height: 7.5 });
  p.layout = "WIDE";
  p.author = CONFIG.author;
  p.title = CONFIG.title;

  const sh = () => ({ type: "outer", color: C.deep2, blur: 9, offset: 3, angle: 135, opacity: 0.20 });
  const shLight = () => ({ type: "outer", color: "94A3B8", blur: 7, offset: 2, angle: 135, opacity: 0.28 });
  const bg = (s, color) => { s.background = { color }; };

  function head(s, kick, title, dark) {
    s.addText(String(kick).toUpperCase(), { x: M, y: 0.5, w: PW - 2 * M, h: 0.35, margin: 0, fontFace: BF, fontSize: 13, bold: true, color: dark ? C.mintTxt : C.primary, charSpacing: 2 });
    s.addText(title, { x: M, y: 0.84, w: PW - 2 * M, h: 0.85, margin: 0, fontFace: HF, fontSize: 29, bold: true, charSpacing: -0.5, color: dark ? "FFFFFF" : C.ink, valign: "top" });
  }
  function iconCircle(s, x, y, d, fill, iconData) {
    s.addShape(p.shapes.OVAL, { x, y, w: d, h: d, fill: { color: fill }, shadow: sh() });
    if (iconData) { const pad = d * 0.27; s.addImage({ data: iconData, x: x + pad, y: y + pad, w: d - 2 * pad, h: d - 2 * pad }); }
  }
  function shot(s, file, x, y, w, h, caption) {
    const full = path.join(CONFIG.shotsDir, file);
    if (!fs.existsSync(full)) { // chưa có ảnh → vẽ ô placeholder
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.06, fill: { color: "E2E8F0" }, line: { color: C.slate, width: 1, dashType: "dash" } });
      s.addText("(ảnh: " + file + ")", { x, y, w, h, margin: 0, fontFace: BF, fontSize: 12, italic: true, color: C.muted, align: "center", valign: "middle" });
    } else {
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.06, fill: { color: "FFFFFF" }, line: { color: C.slate, width: 2 }, shadow: sh() });
      const pad = 0.08;
      s.addImage({ path: full, x: x + pad, y: y + pad, w: w - 2 * pad, h: h - 2 * pad, sizing: { type: "contain", w: w - 2 * pad, h: h - 2 * pad } });
    }
    if (caption && caption.trim()) s.addText(caption, { x, y: y + h + 0.06, w, h: 0.32, margin: 0, fontFace: BF, fontSize: 12.5, italic: true, color: C.muted, align: "center" });
  }
  const col = (name) => C[name] || name; // cho phép dùng tên màu trong CONTENT

  // ---- factories ----
  function titleSlide(d) {
    const s = p.addSlide(); bg(s, C.deep);
    if (d.icon && icTeal[d.icon]) s.addImage({ data: icTeal[d.icon], x: 9.7, y: 1.0, w: 5.2, h: 5.2, transparency: 86 });
    s.addText(String(d.kicker).toUpperCase(), { x: M, y: 1.15, w: 9.5, h: 0.4, margin: 0, fontFace: BF, fontSize: 14, bold: true, color: C.mintTxt, charSpacing: 1.5 });
    s.addText(d.title, { x: M, y: 1.75, w: 11, h: 1.2, margin: 0, fontFace: HF, fontSize: 54, bold: true, charSpacing: -1.2, color: "FFFFFF" });
    if (d.subtitle) s.addText(d.subtitle, { x: M, y: 3.15, w: 11, h: 0.7, margin: 0, fontFace: BF, fontSize: 23, color: C.mint2 });
    let cx = M;
    (d.chips || []).forEach((t) => {
      const w = 0.42 + t.length * 0.115;
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: cx, y: 4.1, w, h: 0.52, rectRadius: 0.26, fill: { color: C.primary } });
      s.addText(t, { x: cx, y: 4.1, w, h: 0.52, margin: 0, fontFace: BF, fontSize: 14, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
      cx += w + 0.25;
    });
    if (d.author) s.addText([{ text: "Tác giả: ", options: { color: C.mintTxt } }, { text: d.author, options: { bold: true, color: "FFFFFF" } }], { x: M, y: 6.35, w: 11, h: 0.4, margin: 0, fontFace: BF, fontSize: 15 });
    s.addNotes(d.notes || "");
    return s;
  }
  function bigStatSlide(d) {
    const s = p.addSlide(); bg(s, d.dark ? C.deep : C.paper);
    head(s, d.kicker, d.title || "", d.dark);
    s.addText(d.stat, { x: M - 0.1, y: 2.0, w: 6.4, h: 1.7, margin: 0, fontFace: HF, fontSize: 90, bold: true, charSpacing: -2.5, color: C.mintTxt, align: "center" });
    if (d.statSub) s.addText(d.statSub, { x: M, y: 3.7, w: 6.2, h: 0.9, margin: 0, fontFace: BF, fontSize: 18, color: d.dark ? C.mint2 : C.slate, align: "center" });
    (d.items || []).forEach((t, i) => {
      const y = 2.25 + i * 1.15;
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 7.1, y, w: PW - M - 7.1, h: 0.95, rectRadius: 0.1, fill: { color: d.dark ? C.cardDark : C.cardBg }, line: { color: C.green, width: 1 } });
      iconCircle(s, 7.4, y + 0.18, 0.6, C.green, ic[d.icon] || null);
      s.addText(t, { x: 8.2, y, w: PW - M - 8.35, h: 0.95, margin: 0, fontFace: BF, fontSize: 16, bold: true, color: d.dark ? "FFFFFF" : C.ink, valign: "middle" });
    });
    if (d.footer) s.addText(d.footer, { x: M, y: 6.15, w: PW - 2 * M, h: 0.7, margin: 0, fontFace: BF, fontSize: 16, italic: true, color: d.dark ? C.mintTxt : C.slate });
    s.addNotes(d.notes || "");
    return s;
  }
  function cardsSlide(d) {
    const s = p.addSlide(); bg(s, d.dark ? C.deep : C.paper);
    head(s, d.kicker, d.title || "", d.dark);
    const cards = d.cards || [];
    const n = cards.length;
    if (n <= 3) { // hàng ngang
      const cw = (PW - 2 * M - (n - 1) * 0.5) / n;
      cards.forEach((row, i) => {
        const x = M + i * (cw + 0.5);
        s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y: 2.4, w: cw, h: 3.3, rectRadius: 0.12, fill: { color: d.dark ? C.cardDark : C.cardBg }, line: { color: d.dark ? col(row[1]) : C.cardBd, width: 1 }, shadow: shLight() });
        iconCircle(s, x + cw / 2 - 0.6, 2.75, 1.2, col(row[1]), (d.dark ? ic : icTeal)[row[0]] || ic[row[0]]);
        s.addText(row[2], { x: x + 0.2, y: 4.1, w: cw - 0.4, h: 0.6, margin: 0, fontFace: HF, fontSize: 22, bold: true, color: d.dark ? "FFFFFF" : C.ink, align: "center" });
        s.addText(row[3], { x: x + 0.3, y: 4.75, w: cw - 0.6, h: 0.9, margin: 0, fontFace: BF, fontSize: 14.5, color: d.dark ? C.mint2 : C.slate, align: "center" });
      });
    } else { // lưới 2 cột
      const cw = (PW - 2 * M - 0.5) / 2;
      cards.forEach((row, i) => {
        const x = M + (i % 2) * (cw + 0.5), y = 2.05 + Math.floor(i / 2) * 2.25;
        s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w: cw, h: 2.0, rectRadius: 0.1, fill: { color: d.dark ? C.cardDark : C.cardBg }, line: { color: C.cardBd, width: 1 }, shadow: shLight() });
        iconCircle(s, x + 0.35, y + 0.35, 0.9, col(row[1]), ic[row[0]] || null);
        s.addText(row[2], { x: x + 1.45, y: y + 0.32, w: cw - 1.7, h: 0.5, margin: 0, fontFace: HF, fontSize: 18, bold: true, color: d.dark ? "FFFFFF" : C.ink });
        s.addText(row[3], { x: x + 1.45, y: y + 0.85, w: cw - 1.7, h: 1.0, margin: 0, fontFace: BF, fontSize: 14, color: d.dark ? C.mint2 : C.slate });
      });
    }
    s.addNotes(d.notes || "");
    return s;
  }
  function stepsSlide(d) {
    const s = p.addSlide(); bg(s, C.paper);
    head(s, d.kicker, d.title || "");
    if (d.lead) s.addText(d.lead, { x: M, y: 1.75, w: PW - 2 * M, h: 0.6, margin: 0, fontFace: BF, fontSize: 16, color: C.slate });
    const steps = d.steps || [], n = steps.length;
    const sw = (PW - 2 * M - (n - 1) * 0.9) / n;
    steps.forEach((st, i) => {
      const x = M + i * (sw + 0.9), last = i === n - 1;
      // Khung tiêu đề bước cao 0.8 (trước là 0.55): tiêu đề 19pt dài hơn một dòng
      // sẽ tràn xuống và CHỒNG LÊN phần mô tả — đúng lỗi đã thấy ở thẻ "Hậu kiểm".
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y: 2.7, w: sw, h: 3.7, rectRadius: 0.12, fill: { color: last ? C.deep : C.cardBg }, line: { color: C.cardBd, width: 1 }, shadow: shLight() });
      iconCircle(s, x + sw / 2 - 0.6, 3.02, 1.2, last ? C.teal : C.primary, ic[st[0]] || null);
      s.addText(st[1], { x: x + 0.25, y: 4.4, w: sw - 0.5, h: 0.8, margin: 0, fontFace: HF, fontSize: 19, bold: true, color: last ? "FFFFFF" : C.ink, align: "center", valign: "top" });
      s.addText(st[2], { x: x + 0.3, y: 5.24, w: sw - 0.6, h: 1.1, margin: 0, fontFace: BF, fontSize: 15.5, color: last ? C.mint2 : C.slate, align: "center", valign: "top" });
      if (i < n - 1 && icTeal.arrow) s.addImage({ data: icTeal.arrow, x: x + sw + 0.22, y: 4.28, w: 0.46, h: 0.46 });
    });
    // Dòng trạng thái trung thực (nếu có) — đặt dưới hàng thẻ.
    if (d.status) {
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: M, y: 6.55, w: PW - 2 * M, h: 0.6, rectRadius: 0.08, fill: { color: C.tealBg }, line: { color: C.teal, width: 1 } });
      s.addText(d.status, { x: M + 0.25, y: 6.55, w: PW - 2 * M - 0.5, h: 0.6, margin: 0, fontFace: BF, fontSize: 14, color: C.ink, valign: "middle" });
    }
    s.addNotes(d.notes || "");
    return s;
  }
  function gallerySlide(d) {
    const s = p.addSlide(); bg(s, C.paper);
    head(s, d.kicker, d.title || "");
    const g = d.shots || [];
    const gcW = (PW - 2 * M - 0.6) / 2;
    g.slice(0, 4).forEach((it, i) => {
      const x = M + (i % 2) * (gcW + 0.6), y = 1.95 + Math.floor(i / 2) * 2.62;
      shot(s, it[0], x, y, gcW, 2.05, it[1]);
    });
    s.addNotes(d.notes || "");
    return s;
  }
  function twoColSlide(d) {
    const s = p.addSlide(); bg(s, C.paper);
    head(s, d.kicker, d.title || "");
    (d.cards || []).slice(0, 2).forEach((f, i) => {
      const y = 2.0 + i * 2.15;
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: M, y, w: 6.1, h: 1.95, rectRadius: 0.1, fill: { color: i === 1 ? C.deep : C.cardBg }, line: { color: C.cardBd, width: 1 }, shadow: shLight() });
      iconCircle(s, M + 0.3, y + 0.3, 0.85, col(f[1]), ic[f[0]] || null);
      s.addText(f[2], { x: M + 1.4, y: y + 0.28, w: 4.55, h: 0.5, margin: 0, fontFace: HF, fontSize: 18, bold: true, color: i === 1 ? "FFFFFF" : C.ink });
      s.addText(f[3], { x: M + 1.4, y: y + 0.8, w: 4.55, h: 1.0, margin: 0, fontFace: BF, fontSize: 13.5, color: i === 1 ? C.mint2 : C.slate });
    });
    if (d.shot) shot(s, d.shot[0], 7.15, 2.1, 5.45, 3.7, d.shot[1]);
    s.addNotes(d.notes || "");
    return s;
  }
  function showcaseSlide(d) {
    const s = p.addSlide(); bg(s, C.paper);
    head(s, d.kicker, d.title || "");
    s.addText(d.lead, { x: M, y: 1.85, w: 4.6, h: 1.0, margin: 0, fontFace: HF, fontSize: 26, bold: true, color: C.ink, valign: "top" });
    (d.features || []).forEach((feature, index) => {
      const y = 3.25 + index * 1.35;
      iconCircle(s, M, y, 0.7, index === 0 ? C.primary : C.teal, ic[feature[0]] || null);
      s.addText(feature[1], { x: M + 0.95, y: y + 0.02, w: 3.95, h: 0.3, margin: 0, fontFace: HF, fontSize: 19, bold: true, color: C.ink });
      s.addText(feature[2], { x: M + 0.95, y: y + 0.42, w: 4.0, h: 0.55, margin: 0, fontFace: BF, fontSize: 15.5, color: C.slate });
    });
    const iw = 6.85, ih = iw / 1.94, ix = PW - M - iw, iy = 2.05;
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: ix - 0.06, y: iy - 0.06, w: iw + 0.12, h: ih + 0.12, rectRadius: 0.08, fill: { color: C.cardBg }, line: { color: C.cardBd, width: 1 }, shadow: shLight() });
    if (d.image && fs.existsSync(d.image)) s.addImage({ path: d.image, x: ix, y: iy, w: iw, h: ih, sizing: { type: "contain", x: ix, y: iy, w: iw, h: ih } });
    else s.addText("[Chưa có ảnh giao diện]", { x: ix, y: iy, w: iw, h: ih, margin: 0, fontFace: BF, fontSize: 16, color: C.muted, align: "center", valign: "middle" });
    if (d.caption) s.addText(d.caption, { x: ix, y: iy + ih + 0.18, w: iw, h: 0.25, margin: 0, fontFace: BF, fontSize: 13, italic: true, color: C.muted, align: "center" });
    s.addNotes(d.notes || "");
    return s;
  }
  function mobileShowcaseSlide(d) {
    const s = p.addSlide(); bg(s, C.paper);
    head(s, d.kicker, d.title || "");
    const phones = d.images || [];
    const phoneW = 2.18, phoneH = phoneW / 0.675;
    [[M + 0.25, 2.05], [M + 2.62, 2.35]].forEach((position, index) => {
      const imagePath = phones[index];
      const [x, y] = position;
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: x - 0.06, y: y - 0.06, w: phoneW + 0.12, h: phoneH + 0.12, rectRadius: 0.12, fill: { color: C.cardBg }, line: { color: C.cardBd, width: 1 }, shadow: shLight() });
      if (imagePath && fs.existsSync(imagePath)) s.addImage({ path: imagePath, x, y, w: phoneW, h: phoneH, sizing: { type: "contain", x, y, w: phoneW, h: phoneH } });
    });
    s.addText("Thiết kế để dễ dùng\ntrên điện thoại", { x: 5.7, y: 1.98, w: 5.7, h: 0.9, margin: 0, fontFace: HF, fontSize: 26, bold: true, color: C.ink, breakLine: false });
    (d.features || []).forEach((feature, index) => {
      const y = 3.0 + index * 0.92;
      const iconName = feature[0] === "flag" || feature[0] === "cloud" ? "layers" : feature[0];
      iconCircle(s, 5.72, y, 0.54, index === 3 ? C.teal : C.primary, ic[iconName] || null);
      s.addText(feature[2], { x: 6.45, y: y - 0.01, w: 3.9, h: 0.25, margin: 0, fontFace: HF, fontSize: 17, bold: true, color: C.ink });
      s.addText(feature[3], { x: 6.45, y: y + 0.32, w: 5.3, h: 0.42, margin: 0, fontFace: BF, fontSize: 14.5, color: C.slate });
    });
    s.addNotes(d.notes || "");
    return s;
  }
  function resultSlide(d) {
    const s = p.addSlide(); bg(s, C.deep);
    s.addText(String(d.kicker).toUpperCase(), { x: M, y: 0.6, w: 10, h: 0.4, margin: 0, fontFace: BF, fontSize: 14, bold: true, color: C.mintTxt, charSpacing: 2 });
    s.addText(d.title || "", { x: M, y: 0.98, w: 11.5, h: 0.8, margin: 0, fontFace: HF, fontSize: 30, bold: true, charSpacing: -0.5, color: "FFFFFF" });
    const cards = (d.cards || []).slice(0, 2);
    cards.forEach((row, i) => {
      const x = i === 0 ? M : 7.0, w = i === 0 ? 6.0 : PW - M - 7.0;
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y: 2.1, w, h: 3.5, rectRadius: 0.12, fill: { color: C.cardDark }, line: { color: col(row[1]), width: 1.2 }, shadow: sh() });
      if (ic[row[0]]) s.addImage({ data: ic[row[0]], x: x + 0.45, y: 2.22, w: 1.05, h: 1.05, transparency: 86 });
      s.addText(row[2], { x: x + 0.3, y: 2.28, w: w - 0.6, h: 0.95, margin: 0, fontFace: HF, fontSize: 44, bold: true, charSpacing: -1, color: C.mintTxt });
      s.addText(row[3], { x: x + 0.3, y: 3.3, w: w - 0.6, h: 2.1, margin: 0, fontFace: BF, fontSize: 14.5, color: "FFFFFF" });
    });
    if (d.footer) {
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: M, y: 5.9, w: PW - 2 * M, h: 0.95, rectRadius: 0.1, fill: { color: C.primary } });
      s.addText(d.footer, { x: M, y: 5.9, w: PW - 2 * M, h: 0.95, margin: 0, fontFace: BF, fontSize: 17, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
    }
    s.addNotes(d.notes || "");
    return s;
  }
  function conclusionSlide(d) {
    const s = p.addSlide(); bg(s, C.deep);
    if (d.icon && icTeal[d.icon]) s.addImage({ data: icTeal[d.icon], x: 9.9, y: 1.2, w: 4.8, h: 4.8, transparency: 88 });
    s.addText(String(d.kicker).toUpperCase(), { x: M, y: 0.6, w: 10, h: 0.4, margin: 0, fontFace: BF, fontSize: 14, bold: true, color: C.mintTxt, charSpacing: 2 });
    s.addText(d.title || "", { x: M, y: 0.98, w: 11.5, h: 0.8, margin: 0, fontFace: HF, fontSize: 30, bold: true, charSpacing: -0.5, color: "FFFFFF" });
    (d.bullets || []).forEach((t, i) => {
      const y = 2.05 + i * 0.85;
      if (ic.check) s.addImage({ data: ic.check, x: M, y: y + 0.05, w: 0.45, h: 0.45 });
      s.addText(t, { x: M + 0.65, y, w: 8.8, h: 0.6, margin: 0, fontFace: BF, fontSize: 17, color: C.mint2, valign: "middle" });
    });
    if (d.asks && d.asks.length) {
      // Khung kiến nghị nới cao hơn + cỡ chữ 17pt để chứa được 3 gạch đầu dòng
      // (bản trước chỉ vừa 2 dòng ở 18pt / h:1.0 nên dòng thứ 3 sẽ tràn khung).
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: M, y: 4.72, w: PW - 2 * M, h: 1.95, rectRadius: 0.12, fill: { color: C.cardDark }, line: { color: C.teal, width: 1.3 }, shadow: sh() });
      s.addText((d.askTitle || "KÍNH ĐỀ NGHỊ").toUpperCase(), { x: M + 0.5, y: 4.9, w: 11, h: 0.45, margin: 0, fontFace: BF, fontSize: 14, bold: true, color: C.mintTxt, charSpacing: 1.5 });
      s.addText(d.asks.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < d.asks.length - 1 } })), { x: M + 0.55, y: 5.32, w: 11, h: 1.25, margin: 0, fontFace: BF, fontSize: 17, bold: true, color: "FFFFFF", paraSpaceAfter: 5 });
    }
    if (d.thanks) s.addText(d.thanks, { x: M, y: 6.85, w: PW - 2 * M, h: 0.4, margin: 0, fontFace: HF, fontSize: 16, italic: true, color: C.mintTxt, align: "right" });
    s.addNotes(d.notes || "");
    return s;
  }
  function appendixSlide(d) {
    const s = p.addSlide(); bg(s, C.paper);
    head(s, d.kicker, d.title || "");
    const rows = d.rows || [];
    let y = 1.9;
    rows.forEach((r, i) => {
      s.addShape(p.shapes.RECTANGLE, { x: M, y, w: 3.5, h: 0.62, fill: { color: i % 2 ? C.cardBg : "E8F2EE" } });
      s.addShape(p.shapes.RECTANGLE, { x: M + 3.5, y, w: PW - 2 * M - 3.5, h: 0.62, fill: { color: i % 2 ? "FFFFFF" : "F6FAF8" } });
      s.addText(r[0], { x: M + 0.15, y, w: 3.2, h: 0.62, margin: 0, fontFace: HF, fontSize: 14, bold: true, color: C.ink, valign: "middle" });
      s.addText(r[1], { x: M + 3.65, y, w: PW - 2 * M - 3.7, h: 0.62, margin: 0, fontFace: BF, fontSize: 13.5, color: C.slate, valign: "middle" });
      y += 0.62;
    });
    s.addNotes(d.notes || "");
    return s;
  }

  function heroSlide(d) {
    const s = p.addSlide(); bg(s, C.deep);
    s.addText(d.text, { x: M, y: 2.35, w: PW - 2 * M, h: 2.8, margin: 0, fontFace: HF, fontSize: d.size || 50, bold: true, charSpacing: -1.2, color: "FFFFFF", align: "center", valign: "middle" });
    s.addNotes(d.notes || "");
    return s;
  }

  function quoteSlide(d) {
    const s = p.addSlide(); bg(s, C.paper);
    s.addShape(p.shapes.RECTANGLE, { x: 2.5, y: 2.5, w: 0.1, h: 2.0, fill: { color: C.primary } });
    const quoteText = d.showQuoteMarks === false ? d.text : '"' + d.text + '"';
    const authorText = d.showQuoteMarks === false ? d.author : "— " + d.author;
    s.addText(quoteText, { x: 3.0, y: 2.5, w: 9, h: 1.5, margin: 0, fontFace: BF, fontSize: 32, italic: true, color: C.ink, valign: "top" });
    s.addText(authorText, { x: 3.0, y: 4.2, w: 9, h: 0.5, margin: 0, fontFace: HF, fontSize: 20, bold: true, color: C.slate });
    s.addNotes(d.notes || "");
    return s;
  }

  // Slide nhúng video minh hoạ (MP4 H.264, không audio). Video được NHÚNG vào file
  // pptx nên mang đi máy khác vẫn phát được; vẫn nên copy kèm thư mục nguồn để dự phòng.
  // LƯU Ý: pptxgenjs KHÔNG đặt được "Start automatically" / "Loop until Stopped" —
  // phải bật tay trong PowerPoint (tab Playback) sau khi mở file.
  function videoSlide(d) {
    const s = p.addSlide(); bg(s, C.paper);
    head(s, d.kicker, d.title || "");
    // Khung 16:9 căn giữa, chừa chỗ cho dòng chú thích "minh hoạ" bên dưới.
    const vw = 8.75, vh = vw * 9 / 16, vx = (PW - vw) / 2, vy = 1.82;
    const exists = d.path && fs.existsSync(d.path);
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: vx - 0.06, y: vy - 0.06, w: vw + 0.12, h: vh + 0.12, rectRadius: 0.1, fill: { color: C.cardBg }, line: { color: C.cardBd, width: 1 }, shadow: shLight() });
    if (exists) {
      s.addMedia({ type: "video", path: d.path, x: vx, y: vy, w: vw, h: vh });
    } else {
      // Không có file: báo rõ trên slide thay vì im lặng bỏ qua.
      s.addText("[Chưa có file video — chạy: cd rag-animation && npm run render]", { x: vx, y: vy, w: vw, h: vh, margin: 0, fontFace: BF, fontSize: 14, color: C.muted, align: "center", valign: "middle" });
    }
    if (d.caption) {
      const cy = vy + vh + 0.22;
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: vx, y: cy, w: vw, h: 0.52, rectRadius: 0.08, fill: { color: C.tealBg }, line: { color: C.teal, width: 1 } });
      s.addText(d.caption, { x: vx + 0.2, y: cy, w: vw - 0.4, h: 0.52, margin: 0, fontFace: BF, fontSize: 14, color: C.ink, align: "center", valign: "middle" });
    }
    s.addNotes(d.notes || "");
    return s;
  }

  // Slide "Hạn chế → Hướng khắc phục": mỗi dòng ghép 1 hạn chế với 1 giải pháp
  // tương ứng, để người nghe thấy ngay mọi hạn chế đều đã có hướng xử lý.
  // Dùng số thứ tự thay cho icon cảnh báo (tránh ẩn dụ sáo mòn); accent teal chỉ
  // xuất hiện ở cột giải pháp — đúng nguyên tắc 1 accent mang nghĩa.
  function limitationsSlide(d) {
    const s = p.addSlide(); bg(s, C.paper);
    head(s, d.kicker, d.title || "");
    if (d.lead) s.addText(d.lead, { x: M, y: 1.68, w: PW - 2 * M, h: 0.45, margin: 0, fontFace: BF, fontSize: 14.5, color: C.slate });

    const LX = M, LW = 5.5, RX = 6.9, RW = PW - M - 6.9;
    const rowH = 0.82, gap = 0.12, y0 = 2.62;

    s.addText(String(d.leftLabel || "Hạn chế").toUpperCase(), { x: LX, y: 2.2, w: LW, h: 0.3, margin: 0, fontFace: BF, fontSize: 12, bold: true, color: C.muted, charSpacing: 1.5 });
    s.addText(String(d.rightLabel || "Hướng khắc phục").toUpperCase(), { x: RX, y: 2.2, w: RW, h: 0.3, margin: 0, fontFace: BF, fontSize: 12, bold: true, color: C.teal, charSpacing: 1.5 });

    (d.pairs || []).forEach((pair, i) => {
      const y = y0 + i * (rowH + gap);
      // Cột trái — hạn chế
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: LX, y, w: LW, h: rowH, rectRadius: 0.08, fill: { color: C.cardBg }, line: { color: C.cardBd, width: 1 } });
      s.addShape(p.shapes.OVAL, { x: LX + 0.22, y: y + rowH / 2 - 0.19, w: 0.38, h: 0.38, fill: { color: C.slate } });
      s.addText(String(i + 1), { x: LX + 0.22, y: y + rowH / 2 - 0.19, w: 0.38, h: 0.38, margin: 0, fontFace: HF, fontSize: 14, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
      s.addText(pair[0], { x: LX + 0.75, y, w: LW - 0.95, h: rowH, margin: 0, fontFace: BF, fontSize: 14.5, bold: true, color: C.ink, valign: "middle" });

      // Mũi tên nối hai cột
      if (icTeal.arrow) s.addImage({ data: icTeal.arrow, x: 6.34, y: y + rowH / 2 - 0.14, w: 0.28, h: 0.28 });

      // Cột phải — hướng khắc phục
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: RX, y, w: RW, h: rowH, rectRadius: 0.08, fill: { color: C.tealBg }, line: { color: C.teal, width: 1 } });
      if (icTeal.check) s.addImage({ data: icTeal.check, x: RX + 0.22, y: y + rowH / 2 - 0.14, w: 0.28, h: 0.28 });
      s.addText(pair[1], { x: RX + 0.62, y, w: RW - 0.82, h: rowH, margin: 0, fontFace: BF, fontSize: 14, color: C.ink, valign: "middle" });
    });

    s.addNotes(d.notes || "");
    return s;
  }

  const FACTORY = { title: titleSlide, bigStat: bigStatSlide, cards: cardsSlide, steps: stepsSlide, gallery: gallerySlide, twoCol: twoColSlide, showcase: showcaseSlide, mobileShowcase: mobileShowcaseSlide, result: resultSlide, conclusion: conclusionSlide, appendix: appendixSlide, hero: heroSlide, quote: quoteSlide, limitations: limitationsSlide, video: videoSlide };

  // ---- assemble ----
  const morphSlides = [];
  if (CONTENT.title) titleSlide(CONTENT.title);
  CONTENT.slides.forEach((d) => {
    const f = FACTORY[d.type];
    if (!f) { console.warn("[slide] type không hỗ trợ:", d.type); return; }
    f(d);
    if (d.transition === "morph") morphSlides.push(p.slides.length);
  });

  await p.writeFile({ fileName: CONFIG.outFile });
  const t = await applyTransitions(CONFIG.outFile, morphSlides);
  console.log(`OK: ${p.slides.length} slides · Morph: ${t.nMorph} · Fade: ${t.nFade} → ${CONFIG.outFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
