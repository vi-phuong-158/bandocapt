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
const THEME = {
  deep: "1e3a8a", deep2: "1e40af", primary: "1d4ed8", green: "059669", lime: "22c55e",
  mintTxt: "dbeafe", mint2: "eff6ff", danger: "CC0000", warn: "d97706",
  paper: "FFFFFF", ink: "0f172a", slate: "334155", muted: "64748b",
  cardBg: "f8fafc", cardBd: "e2e8f0",
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
      kicker: "Thực trạng", stat: "Hàng ngàn",
      statSub: "Giờ bị lãng phí mỗi năm",
      items: ["Người dân loay hoay tìm địa chỉ đúng", "Đi lại nhiều lần vì sai thủ tục", "Cán bộ quá tải vì trả lời lặp lại"],
      icon: "hourglass",
      footer: "Đó là nỗi đau chung của cả người dân và cán bộ tiếp dân.",
      notes: "Hàng ngàn giờ bị lãng phí mỗi năm. Người dân thì loay hoay tìm đúng trụ sở, mòn mỏi đi lại vì chuẩn bị sai thủ tục. Còn cán bộ thì quá tải vì phải trả lời những câu hỏi giống hệt nhau ngày này qua ngày khác. Đó là nỗi đau thực sự.",
    },
    {
      type: "quote",
      text: "Giá như có ai đó hướng dẫn chính xác\ntrước khi tôi đến làm thủ tục thì tốt biết mấy.",
      author: "Một người dân",
      notes: "Chúng tôi thường xuyên nghe người dân than phiền: Giá như có ai đó hướng dẫn chính xác trước khi đến. Chính lời than phiền này đã thôi thúc Câu lạc bộ Sáng tạo hành động.",
    },
    {
      type: "twoCol",
      kicker: "Cú hích giải pháp", title: "Bản đồ Công an số",
      cards: [
        ["search", "primary", "Bản đồ tương tác", "Định vị mạng lưới trụ sở trên nền OpenStreetMap."],
        ["user360", "green", "Trợ lý ảo AI", "Tư vấn thủ tục hành chính, giải đáp 24/7."],
      ],
      notes: "Và đó là lý do Bản đồ Công an số ra đời. Nó không chỉ là một cái bản đồ khô khan. Nó là sự kết hợp giữa bản đồ định vị chính xác mọi trụ sở, và một Trợ lý ảo AI hiểu luật, túc trực 24/7 để tư vấn thủ tục cho dân.",
    },
    {
      type: "hero", transition: "morph",
      text: "AI của chúng tôi\nKHÔNG BAO GIỜ nói dối.",
      notes: "Nhưng thưa các đồng chí, dùng AI thì sợ nhất là AI bịa chuyện. Tôi xin khẳng định: AI của chúng tôi KHÔNG BAO GIỜ nói dối. Nó được xây dựng trên công nghệ RAG, chỉ được phép trả lời dựa trên văn bản quy phạm pháp luật và luôn có trích dẫn nguồn rõ ràng.",
    },
    {
      type: "cards",
      kicker: "Tính năng vượt trội", title: "Phục vụ nhân dân địa phương",
      cards: [
        ["users", "primary", "Thân thiện dễ dùng", "Giao diện tối giản, tối ưu cho điện thoại di động."],
        ["flag", "slate", "Hỗ trợ Ngoại ngữ", "Dịch Tiếng Anh/Trung/Hàn cho người nước ngoài."],
        ["cloud", "green", "Quản trị linh hoạt", "Cán bộ cập nhật dữ liệu tự động qua Google Sheets."],
        ["shield", "danger", "Bảo mật", "Ngăn chặn tấn công bằng hệ thống Cloudflare Turnstile."]
      ],
      notes: "Hệ thống cực kỳ thân thiện với người dân địa phương qua giao diện điện thoại. Ngoài ra, để hỗ trợ hội nhập, nó còn bổ sung tính năng đa ngôn ngữ. Về phía cán bộ, việc quản trị cũng cực kỳ đơn giản qua Google Sheets.",
    },
    {
      type: "result", dark: true, transition: "morph",
      kicker: "Giá trị mang lại", title: "Sự đánh đổi xứng đáng",
      cards: [
        ["users", "lime", "VẠN NGƯỜI", "Hưởng lợi từ hệ thống, tiết kiệm công sức đi lại."],
        ["clock", "warn", "[SỐ LIỆU]", "Giây là thời gian phản hồi cho mỗi thủ tục."],
      ],
      footer: "Dự án yêu cầu chi phí đầu tư hạ tầng, nhưng là khoản đầu tư vô giá cho công tác chuyển đổi số.",
      notes: "Để vận hành, dự án đòi hỏi chi phí đầu tư hạ tầng máy chủ và API. Tuy nhiên, sự đánh đổi này là hoàn toàn xứng đáng. Một khoản đầu tư mang lại lợi ích cho hàng vạn người, giúp người dân tiết kiệm thời gian, giảm áp lực cực lớn cho cán bộ trực ban.",
    },
    {
      type: "conclusion", dark: true,
      kicker: "Tầm nhìn thiết thực", title: "Một chính quyền số gần dân",
      bullets: [
        "Hoàn thiện hệ sinh thái dịch vụ công thông minh.",
        "Xây dựng hình ảnh Công an Phú Thọ hiện đại, tận tụy.",
      ],
      askTitle: "KÍNH ĐỀ NGHỊ LÃNH ĐẠO CÔNG AN TỈNH",
      asks: ["Chấp thuận triển khai nhân rộng toàn tỉnh", "Cấp kinh phí duy trì hạ tầng AI hằng năm"],
      thanks: "Xin trân trọng cảm ơn các đồng chí Lãnh đạo!",
      icon: "shield",
      notes: "Kính thưa các đồng chí Lãnh đạo, đây không chỉ là một phần mềm, đây là viên gạch góp phần xây dựng hình ảnh chính quyền số gần dân. Chúng tôi kính đề nghị Lãnh đạo Công an tỉnh cho phép nhân rộng toàn tỉnh và cấp kinh phí duy trì hạ tầng để phục vụ nhân dân lâu dài. Xin trân trọng cảm ơn.",
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
  };
  collect(CONTENT.title);
  CONTENT.slides.forEach(collect);
  const ic = {}, icTeal = {};
  for (const k of usedKeys) { ic[k] = await renderIcon(k, "#FFFFFF"); icTeal[k] = await renderIcon(k, "#0B7A75"); }

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
    s.addText(title, { x: M, y: 0.84, w: PW - 2 * M, h: 0.85, margin: 0, fontFace: HF, fontSize: 29, bold: true, color: dark ? "FFFFFF" : C.ink, valign: "top" });
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
    s.addText(d.title, { x: M, y: 1.75, w: 11, h: 1.2, margin: 0, fontFace: HF, fontSize: 54, bold: true, color: "FFFFFF" });
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
    s.addText(d.stat, { x: M - 0.1, y: 2.0, w: 6.4, h: 1.7, margin: 0, fontFace: HF, fontSize: 90, bold: true, color: C.mintTxt, align: "center" });
    if (d.statSub) s.addText(d.statSub, { x: M, y: 3.7, w: 6.2, h: 0.9, margin: 0, fontFace: BF, fontSize: 18, color: d.dark ? C.mint2 : C.slate, align: "center" });
    (d.items || []).forEach((t, i) => {
      const y = 2.25 + i * 1.15;
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 7.1, y, w: PW - M - 7.1, h: 0.95, rectRadius: 0.1, fill: { color: d.dark ? "0E4A44" : C.cardBg }, line: { color: C.green, width: 1 } });
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
        s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y: 2.4, w: cw, h: 3.3, rectRadius: 0.12, fill: { color: d.dark ? "0E4A44" : C.cardBg }, line: { color: d.dark ? col(row[1]) : C.cardBd, width: 1 }, shadow: shLight() });
        iconCircle(s, x + cw / 2 - 0.6, 2.75, 1.2, col(row[1]), (d.dark ? ic : icTeal)[row[0]] || ic[row[0]]);
        s.addText(row[2], { x: x + 0.2, y: 4.1, w: cw - 0.4, h: 0.6, margin: 0, fontFace: HF, fontSize: 22, bold: true, color: d.dark ? "FFFFFF" : C.ink, align: "center" });
        s.addText(row[3], { x: x + 0.3, y: 4.75, w: cw - 0.6, h: 0.9, margin: 0, fontFace: BF, fontSize: 14.5, color: d.dark ? C.mint2 : C.slate, align: "center" });
      });
    } else { // lưới 2 cột
      const cw = (PW - 2 * M - 0.5) / 2;
      cards.forEach((row, i) => {
        const x = M + (i % 2) * (cw + 0.5), y = 2.05 + Math.floor(i / 2) * 2.25;
        s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w: cw, h: 2.0, rectRadius: 0.1, fill: { color: d.dark ? "0E4A44" : C.cardBg }, line: { color: C.cardBd, width: 1 }, shadow: shLight() });
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
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y: 2.7, w: sw, h: 3.4, rectRadius: 0.12, fill: { color: last ? C.deep : C.cardBg }, line: { color: C.cardBd, width: 1 }, shadow: shLight() });
      iconCircle(s, x + sw / 2 - 0.6, 3.05, 1.2, last ? C.green : C.primary, ic[st[0]] || null);
      s.addText(st[1], { x: x + 0.25, y: 4.45, w: sw - 0.5, h: 0.55, margin: 0, fontFace: HF, fontSize: 19, bold: true, color: last ? "FFFFFF" : C.ink, align: "center" });
      s.addText(st[2], { x: x + 0.3, y: 5.05, w: sw - 0.6, h: 0.95, margin: 0, fontFace: BF, fontSize: 14.5, color: last ? C.mint2 : C.slate, align: "center" });
      if (i < n - 1 && icTeal.arrow) s.addImage({ data: icTeal.arrow, x: x + sw + 0.22, y: 4.15, w: 0.46, h: 0.46 });
    });
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
  function resultSlide(d) {
    const s = p.addSlide(); bg(s, C.deep);
    s.addText(String(d.kicker).toUpperCase(), { x: M, y: 0.6, w: 10, h: 0.4, margin: 0, fontFace: BF, fontSize: 14, bold: true, color: C.mintTxt, charSpacing: 2 });
    s.addText(d.title || "", { x: M, y: 0.98, w: 11.5, h: 0.8, margin: 0, fontFace: HF, fontSize: 30, bold: true, color: "FFFFFF" });
    const cards = (d.cards || []).slice(0, 2);
    cards.forEach((row, i) => {
      const x = i === 0 ? M : 7.0, w = i === 0 ? 6.0 : PW - M - 7.0;
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y: 2.1, w, h: 3.5, rectRadius: 0.12, fill: { color: "0E4A44" }, line: { color: col(row[1]), width: 1.2 }, shadow: sh() });
      if (ic[row[0]]) s.addImage({ data: ic[row[0]], x: x + 0.45, y: 2.22, w: 1.05, h: 1.05, transparency: 86 });
      s.addText(row[2], { x: x + 0.3, y: 2.28, w: w - 0.6, h: 0.95, margin: 0, fontFace: HF, fontSize: 44, bold: true, color: C.mintTxt });
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
    s.addText(d.title || "", { x: M, y: 0.98, w: 11.5, h: 0.8, margin: 0, fontFace: HF, fontSize: 30, bold: true, color: "FFFFFF" });
    (d.bullets || []).forEach((t, i) => {
      const y = 2.05 + i * 0.85;
      if (ic.check) s.addImage({ data: ic.check, x: M, y: y + 0.05, w: 0.45, h: 0.45 });
      s.addText(t, { x: M + 0.65, y, w: 8.8, h: 0.6, margin: 0, fontFace: BF, fontSize: 17, color: C.mint2, valign: "middle" });
    });
    if (d.asks && d.asks.length) {
      s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: M, y: 4.95, w: PW - 2 * M, h: 1.7, rectRadius: 0.12, fill: { color: "0E4A44" }, line: { color: C.lime, width: 1.3 }, shadow: sh() });
      s.addText((d.askTitle || "KÍNH ĐỀ NGHỊ").toUpperCase(), { x: M + 0.5, y: 5.15, w: 11, h: 0.45, margin: 0, fontFace: BF, fontSize: 14, bold: true, color: C.mintTxt, charSpacing: 1.5 });
      s.addText(d.asks.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < d.asks.length - 1 } })), { x: M + 0.55, y: 5.6, w: 11, h: 1.0, margin: 0, fontFace: BF, fontSize: 18, bold: true, color: "FFFFFF", paraSpaceAfter: 6 });
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
    s.addText(d.text, { x: M, y: 2.5, w: PW - 2 * M, h: 2.5, margin: 0, fontFace: HF, fontSize: 50, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
    s.addNotes(d.notes || "");
    return s;
  }

  function quoteSlide(d) {
    const s = p.addSlide(); bg(s, C.paper);
    s.addShape(p.shapes.RECTANGLE, { x: 2.5, y: 2.5, w: 0.1, h: 2.0, fill: { color: C.primary } });
    s.addText('"' + d.text + '"', { x: 3.0, y: 2.5, w: 9, h: 1.5, margin: 0, fontFace: BF, fontSize: 32, italic: true, color: C.ink, valign: "top" });
    s.addText("— " + d.author, { x: 3.0, y: 4.2, w: 9, h: 0.5, margin: 0, fontFace: HF, fontSize: 20, bold: true, color: C.slate });
    s.addNotes(d.notes || "");
    return s;
  }

  const FACTORY = { title: titleSlide, bigStat: bigStatSlide, cards: cardsSlide, steps: stepsSlide, gallery: gallerySlide, twoCol: twoColSlide, result: resultSlide, conclusion: conclusionSlide, appendix: appendixSlide, hero: heroSlide, quote: quoteSlide };

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
