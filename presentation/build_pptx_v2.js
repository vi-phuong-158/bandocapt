'use strict';

const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');
const JSZip = require('jszip');
const React = require('react');
const ReactDOMServer = require('react-dom/server');
const sharp = require('sharp');
const FA = require('react-icons/fa');
const pptx = new pptxgen();

const CONFIG = {
    output: path.join(__dirname, 'Ban-do-Cong-an-so-Phu-Tho-V2.pptx'),
    notes: path.join(__dirname, 'Ban-doc-thuyet-trinh.md'),
    desktop: path.join(__dirname, 'asset', 'giao dien desktop.png'),
    phoneChat: path.join(__dirname, 'asset', 'chat bot tra loi.png'),
    phoneLookup: path.join(__dirname, 'asset', 'tra cuu thu tục tren dien thoai.png'),
    video: path.join(__dirname, 'rag-animation', 'out', 'RagSlideAnimation.mp4'),
    author: 'Câu lạc bộ Sáng tạo',
    title: 'Bản đồ Công an số tỉnh Phú Thọ',
    font: 'Segoe UI',
};

const C = {
    deep: '1E3A8A',
    deepDark: '16306E',
    blue: '1D4ED8',
    teal: '0B7A75',
    white: 'FFFFFF',
    paper: 'F8FAFC',
    ink: '0F172A',
    slate: '334155',
    muted: '64748B',
    border: 'E2E8F0',
    paleBlue: 'EFF6FF',
    paleTeal: 'EAF6F5',
    navySoft: 'DCE6F8',
};

const ICONS = {
    citizen: FA.FaUser,
    phone: FA.FaMobileAlt,
    pin: FA.FaMapMarkerAlt,
    station: FA.FaLandmark,
    map: FA.FaMapMarkedAlt,
    ai: FA.FaRobot,
    search: FA.FaSearch,
    document: FA.FaFileAlt,
    filter: FA.FaFilter,
    shield: FA.FaShieldAlt,
    source: FA.FaLink,
    repeat: FA.FaSyncAlt,
    route: FA.FaRoute,
    file: FA.FaClipboardList,
    staff: FA.FaUserShield,
    globe: FA.FaGlobeAsia,
    cloud: FA.FaCloudUploadAlt,
    lock: FA.FaLock,
    clock: FA.FaClock,
    warning: FA.FaExclamationCircle,
    solution: FA.FaCheckCircle,
    pilot: FA.FaFlask,
    review: FA.FaClipboardCheck,
    people: FA.FaUsersCog,
    arrow: FA.FaArrowRight,
};

const W = 13.333;
const H = 7.5;
const M = 0.66;
const FONT = CONFIG.font;

function loadSpeakerNotes() {
    const markdown = fs.readFileSync(CONFIG.notes, 'utf8');
    const sections = markdown.split(/(?=^## SLIDE \d+\s+—)/gm);
    return sections.slice(1).map((section) => {
        const match = section.match(/🗣️ \*\*LỜI ĐỌC:\*\*\s*\r?\n([\s\S]*?)(?=\r?\n---|\r?\n## SLIDE|$)/);
        return match ? match[1].trim() : '';
    });
}

async function renderIcon(component, color = '#FFFFFF', size = 256) {
    const svg = ReactDOMServer.renderToStaticMarkup(
        React.createElement(component, { color, size: String(size) })
    );
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    return `image/png;base64,${png.toString('base64')}`;
}

async function loadIcons() {
    const colors = { white: '#FFFFFF', blue: '#1D4ED8', teal: '#0B7A75', navy: '#1E3A8A', slate: '#334155' };
    const output = {};
    for (const [name, component] of Object.entries(ICONS)) {
        output[name] = {};
        for (const [tone, color] of Object.entries(colors)) output[name][tone] = await renderIcon(component, color);
    }
    return output;
}

function shadow(opacity = 0.16, blur = 6, offset = 2) {
    return { type: 'outer', color: '64748B', opacity, blur, offset, angle: 45 };
}

function addIcon(slide, iconData, x, y, size, background = C.blue, padding = 0.24) {
    slide.addShape(pptx.ShapeType.ellipse, {
        x, y, w: size, h: size,
        fill: { color: background },
        line: { color: background },
    });
    slide.addImage({ data: iconData, x: x + size * padding, y: y + size * padding, w: size * (1 - 2 * padding), h: size * (1 - 2 * padding) });
}

function addSlideHeader(slide, kicker, title, options = {}) {
    const dark = options.dark || false;
    slide.addText(kicker.toUpperCase(), {
        x: M, y: 0.38, w: 7.5, h: 0.27, margin: 0,
        fontFace: FONT, fontSize: 12.5, bold: true, charSpacing: 2.2,
        color: dark ? 'C9D8F5' : C.blue,
    });
    slide.addText(title, {
        x: M, y: 0.71, w: options.titleWidth || 12.0, h: 0.58, margin: 0,
        fontFace: FONT, fontSize: options.titleSize || 30, bold: true,
        color: dark ? C.white : C.ink, breakLine: false,
    });
    slide.addShape(pptx.ShapeType.line, {
        x: M, y: 1.36, w: 1.05, h: 0,
        line: { color: dark ? C.teal : C.blue, width: 2.5 },
    });
}

function addFooterNote(slide, number, options = {}) {
    const dark = options.dark || false;
    const color = dark ? 'BFD0F0' : C.muted;
    slide.addShape(pptx.ShapeType.line, {
        x: M, y: 7.17, w: W - 2 * M, h: 0,
        line: { color: dark ? '36559B' : C.border, width: 0.7 },
    });
    slide.addText('BẢN ĐỒ CÔNG AN SỐ · TỈNH PHÚ THỌ', {
        x: M, y: 7.22, w: 5.0, h: 0.18, margin: 0,
        fontFace: FONT, fontSize: 9.5, bold: true, charSpacing: 1.2, color,
    });
    slide.addText(String(number).padStart(2, '0'), {
        x: W - M - 0.4, y: 7.2, w: 0.4, h: 0.2, margin: 0,
        fontFace: FONT, fontSize: 10, bold: true, align: 'right', color,
    });
}

function addStatusBadge(slide, text, x, y, w, active = false, dark = false) {
    const fill = active ? C.teal : (dark ? C.deepDark : C.paleBlue);
    const textColor = active || dark ? C.white : C.deep;
    slide.addShape(pptx.ShapeType.roundRect, {
        x, y, w, h: 0.38, rectRadius: 0.08,
        fill: { color: fill },
        line: { color: active ? C.teal : C.blue, width: 0.8 },
    });
    slide.addText(text.toUpperCase(), {
        x: x + 0.08, y, w: w - 0.16, h: 0.38, margin: 0,
        fontFace: FONT, fontSize: 9.5, bold: true, charSpacing: 0.6,
        color: textColor, align: 'center', valign: 'mid',
    });
}

function addSectionNumber(slide, number, x, y, dark = false) {
    slide.addShape(pptx.ShapeType.ellipse, {
        x, y, w: 0.38, h: 0.38,
        fill: { color: dark ? C.teal : C.deep },
        line: { color: dark ? C.teal : C.deep },
    });
    slide.addText(String(number), {
        x, y, w: 0.38, h: 0.38, margin: 0,
        fontFace: FONT, fontSize: 11, bold: true, color: C.white,
        align: 'center', valign: 'mid',
    });
}

function addConnectorArrow(slide, x1, y1, x2, y2, options = {}) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    slide.addShape(pptx.ShapeType.line, {
        x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(dx), h: Math.abs(dy),
        flipH: dx < 0,
        flipV: dy < 0,
        line: {
            color: options.color || C.blue,
            width: options.width || 1.4,
            transparency: options.transparency || 0,
            dash: options.dash || 'solid',
            endArrowType: options.arrow === false ? 'none' : 'triangle',
        },
    });
}

function addMapWatermark(slide, x, y, w, h, dark = true) {
    const points = [
        [0.43, 0.02], [0.72, 0.10], [0.91, 0.31], [0.83, 0.52],
        [0.96, 0.71], [0.67, 0.96], [0.38, 0.87], [0.23, 0.99],
        [0.08, 0.70], [0.18, 0.48], [0.02, 0.27], [0.27, 0.17], [0.43, 0.02],
    ];
    const color = dark ? '6F89C5' : 'B8C9E9';
    for (let i = 0; i < points.length - 1; i++) {
        addConnectorArrow(slide,
            x + points[i][0] * w, y + points[i][1] * h,
            x + points[i + 1][0] * w, y + points[i + 1][1] * h,
            { color, width: 1.2, transparency: 46, arrow: false }
        );
    }
    const nodes = [[0.26, 0.36], [0.55, 0.23], [0.72, 0.46], [0.42, 0.66], [0.68, 0.79], [0.20, 0.73]];
    for (let i = 0; i < nodes.length - 1; i++) {
        addConnectorArrow(slide,
            x + nodes[i][0] * w, y + nodes[i][1] * h,
            x + nodes[i + 1][0] * w, y + nodes[i + 1][1] * h,
            { color, width: 0.8, transparency: 60, arrow: false }
        );
    }
    nodes.forEach(([nx, ny], index) => {
        slide.addShape(pptx.ShapeType.ellipse, {
            x: x + nx * w - 0.05, y: y + ny * h - 0.05, w: 0.1, h: 0.1,
            fill: { color: index === 3 ? C.teal : color, transparency: 12 },
            line: { color: index === 3 ? C.teal : color, transparency: 25 },
        });
    });
}

function addBrowserMockup(slide, imagePath, x, y, w, h) {
    slide.addShape(pptx.ShapeType.roundRect, {
        x, y, w, h, rectRadius: 0.1,
        fill: { color: C.white },
        line: { color: C.border, width: 1 },
        shadow: shadow(0.18, 8, 2),
    });
    slide.addShape(pptx.ShapeType.rect, {
        x, y, w, h: 0.34,
        fill: { color: C.deepDark },
        line: { color: C.deepDark },
    });
    ['8EA3D1', 'B7C5E3', C.teal].forEach((color, index) => {
        slide.addShape(pptx.ShapeType.ellipse, {
            x: x + 0.16 + index * 0.18, y: y + 0.11, w: 0.08, h: 0.08,
            fill: { color }, line: { color },
        });
    });
    if (fs.existsSync(imagePath)) {
        slide.addImage({ path: imagePath, x: x + 0.08, y: y + 0.42, w: w - 0.16, h: h - 0.5, sizing: { type: 'contain', x: x + 0.08, y: y + 0.42, w: w - 0.16, h: h - 0.5 } });
    } else {
        console.warn(`[asset] Thiếu ảnh: ${imagePath}`);
        slide.addText(`[Chưa có ảnh giao diện]\n${imagePath}`, {
            x: x + 0.2, y: y + 0.7, w: w - 0.4, h: h - 1,
            fontFace: FONT, fontSize: 13, color: C.muted, align: 'center', valign: 'mid',
        });
    }
}

function addDeviceMockup(slide, imagePath, x, y, w, h, label) {
    slide.addShape(pptx.ShapeType.roundRect, {
        x, y, w, h, rectRadius: 0.16,
        fill: { color: C.ink },
        line: { color: C.ink, width: 1.2 },
        shadow: shadow(0.2, 7, 2),
    });
    slide.addShape(pptx.ShapeType.roundRect, {
        x: x + 0.08, y: y + 0.12, w: w - 0.16, h: h - 0.24, rectRadius: 0.13,
        fill: { color: C.white }, line: { color: C.white },
    });
    slide.addShape(pptx.ShapeType.roundRect, {
        x: x + w * 0.37, y: y + 0.06, w: w * 0.26, h: 0.09, rectRadius: 0.04,
        fill: { color: C.ink }, line: { color: C.ink },
    });
    if (fs.existsSync(imagePath)) {
        slide.addImage({ path: imagePath, x: x + 0.11, y: y + 0.18, w: w - 0.22, h: h - 0.36, sizing: { type: 'contain', x: x + 0.11, y: y + 0.18, w: w - 0.22, h: h - 0.36 } });
    } else {
        console.warn(`[asset] Thiếu ảnh: ${imagePath}`);
        slide.addText('CHƯA CÓ ẢNH', { x: x + 0.2, y: y + 1, w: w - 0.4, h: 0.4, fontFace: FONT, fontSize: 12, color: C.muted, align: 'center' });
    }
    if (label) slide.addText(label, { x: x - 0.1, y: y + h + 0.12, w: w + 0.2, h: 0.24, margin: 0, fontFace: FONT, fontSize: 11, bold: true, color: C.muted, align: 'center' });
}

function addProcessNode(slide, iconData, number, title, body, x, y, w, h, options = {}) {
    const active = options.active || false;
    slide.addShape(pptx.ShapeType.roundRect, {
        x, y, w, h, rectRadius: 0.08,
        fill: { color: active ? C.deepDark : C.white },
        line: { color: active ? C.teal : C.border, width: active ? 1.5 : 1 },
        shadow: shadow(0.1, 4, 1),
    });
    addSectionNumber(slide, number, x + 0.13, y + 0.13, active);
    slide.addImage({ data: iconData, x: x + w - 0.44, y: y + 0.14, w: 0.25, h: 0.25 });
    slide.addText(title, {
        x: x + 0.15, y: y + 0.65, w: w - 0.3, h: 0.58, margin: 0,
        fontFace: FONT, fontSize: 15.5, bold: true,
        color: active ? C.white : C.ink, valign: 'top',
    });
    slide.addText(body, {
        x: x + 0.15, y: y + 1.27, w: w - 0.3, h: h - 1.4, margin: 0,
        fontFace: FONT, fontSize: 11.3,
        color: active ? 'DCE6F8' : C.slate, valign: 'top',
    });
}

function addMetricBlock(slide, x, y, w, h, metric, label, dark = false) {
    slide.addShape(pptx.ShapeType.roundRect, {
        x, y, w, h, rectRadius: 0.1,
        fill: { color: dark ? C.deepDark : C.white },
        line: { color: dark ? '36559B' : C.border, width: 1 },
    });
    slide.addText(metric, {
        x: x + 0.35, y: y + 0.35, w: w - 0.7, h: 0.9, margin: 0,
        fontFace: FONT, fontSize: 42, bold: true,
        color: dark ? C.white : C.deep,
    });
    slide.addText(label, {
        x: x + 0.35, y: y + 1.35, w: w - 0.7, h: 0.72, margin: 0,
        fontFace: FONT, fontSize: 16, color: dark ? 'DCE6F8' : C.slate,
    });
}

function addProblemSolutionRow(slide, number, problem, solution, y, icons) {
    addSectionNumber(slide, number, M, y + 0.16);
    slide.addImage({ data: icons.warning.slate, x: 1.17, y: y + 0.19, w: 0.23, h: 0.23 });
    slide.addText(problem, {
        x: 1.48, y, w: 4.2, h: 0.72, margin: 0,
        fontFace: FONT, fontSize: 14.2, bold: true, color: C.slate, valign: 'mid',
    });
    addConnectorArrow(slide, 5.83, y + 0.36, 6.45, y + 0.36, { color: C.blue, width: 1.2 });
    slide.addShape(pptx.ShapeType.roundRect, {
        x: 6.62, y, w: 6.05, h: 0.72, rectRadius: 0.07,
        fill: { color: C.paleTeal }, line: { color: 'B6D9D5', width: 0.8 },
    });
    slide.addImage({ data: icons.solution.teal, x: 6.83, y: y + 0.19, w: 0.23, h: 0.23 });
    slide.addText(solution, {
        x: 7.16, y, w: 5.25, h: 0.72, margin: 0,
        fontFace: FONT, fontSize: 13.2, color: C.ink, valign: 'mid',
    });
}

function addNotesAndFooter(slide, slideNumber, notes, dark = false) {
    addFooterNote(slide, slideNumber, { dark });
    slide.addNotes(notes || '');
}

const MC = 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
const P159 = 'xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/9/main"';
const P14 = 'xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"';
const morphXml = `<mc:AlternateContent ${MC}><mc:Choice ${P159} Requires="p159"><p:transition ${P14} spd="med" p14:dur="800"><p159:morph option="byObject"/></p:transition></mc:Choice><mc:Fallback><p:transition spd="med"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>`;
const fadeXml = `<p:transition ${P14} spd="med" p14:dur="450"><p:fade/></p:transition>`;

async function applyTransitions(file, morphSlides) {
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    const slideFiles = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
    for (const name of slideFiles) {
        const number = Number(name.match(/slide(\d+)\.xml/)[1]);
        let xml = await zip.file(name).async('string');
        // Không xóa mc:AlternateContent: PptxGenJS dùng khối này cho media/video.
        // File V2 luôn được dựng mới nên chỉ cần loại transition trực tiếp nếu có.
        xml = xml.replace(/<p:transition[\s\S]*?<\/p:transition>/g, '');
        xml = xml.replace('</p:sld>', `${morphSlides.includes(number) ? morphXml : fadeXml}</p:sld>`);
        zip.file(name, xml);
    }
    fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

async function build() {
    const notes = loadSpeakerNotes();
    if (notes.length !== 11 || notes.some((note) => !note)) throw new Error(`Không đọc đủ 11 speaker notes từ ${CONFIG.notes}`);
    const icons = await loadIcons();
    const pptx = new pptxgen();
    pptx.defineLayout({ name: 'WIDE', width: W, height: H });
    pptx.layout = 'WIDE';
    pptx.author = CONFIG.author;
    pptx.company = 'Câu lạc bộ Sáng tạo';
    pptx.subject = 'Civic Tech · Chính quyền số · Công nghệ phục vụ nhân dân';
    pptx.title = CONFIG.title;
    pptx.lang = 'vi-VN';
    pptx.theme = {
        headFontFace: FONT,
        bodyFontFace: FONT,
        lang: 'vi-VN',
    };

    // Slide 1 — cover
    {
        const slide = pptx.addSlide();
        slide.background = { color: C.deep };
        addMapWatermark(slide, 8.18, 0.56, 4.36, 5.8, true);
        slide.addShape(pptx.ShapeType.line, { x: 7.58, y: 0.8, w: 0, h: 5.9, line: { color: '36559B', width: 0.7 } });
        slide.addText('CÔNG TRÌNH CÂU LẠC BỘ SÁNG TẠO', { x: M, y: 0.9, w: 6.5, h: 0.3, margin: 0, fontFace: FONT, fontSize: 13, bold: true, charSpacing: 2.2, color: 'C9D8F5' });
        slide.addText('BẢN ĐỒ\nCÔNG AN SỐ', { x: M, y: 1.48, w: 6.65, h: 1.78, margin: 0, breakLine: false, fontFace: FONT, fontSize: 47, bold: true, color: C.white, breakLineOnTextOverflow: false });
        slide.addText('Tỉnh Phú Thọ', { x: M, y: 3.42, w: 4, h: 0.46, margin: 0, fontFace: FONT, fontSize: 24, color: 'DCE6F8' });
        const badges = [['Dành cho công dân', 1.67], ['AI tư vấn tự động', 1.73], ['Bản đồ tương tác', 1.65]];
        let bx = M;
        badges.forEach(([text, width], index) => {
            addStatusBadge(slide, text, bx, 4.18, width, index === 0, true);
            bx += width + 0.17;
        });
        addConnectorArrow(slide, 8.65, 3.72, 11.36, 4.65, { color: C.teal, width: 2 });
        addIcon(slide, icons.pin.white, 8.36, 3.41, 0.58, C.teal, 0.28);
        slide.addShape(pptx.ShapeType.roundRect, { x: 10.35, y: 4.12, w: 2.24, h: 1.38, rectRadius: 0.08, fill: { color: C.white }, line: { color: '8EA3D1', width: 1 }, shadow: shadow(0.18, 6, 2) });
        slide.addText('TRỢ LÝ AI', { x: 10.58, y: 4.32, w: 1.3, h: 0.2, margin: 0, fontFace: FONT, fontSize: 9.5, bold: true, charSpacing: 1, color: C.blue });
        slide.addText('Tôi có thể hỗ trợ\ntra cứu thủ tục.', { x: 10.58, y: 4.65, w: 1.55, h: 0.45, margin: 0, fontFace: FONT, fontSize: 12.2, bold: true, color: C.ink });
        addIcon(slide, icons.ai.white, 11.84, 4.29, 0.48, C.blue, 0.26);
        slide.addText([{ text: 'Tác giả  ', options: { color: 'AFC2E8' } }, { text: CONFIG.author, options: { bold: true, color: C.white } }], { x: M, y: 6.58, w: 5.5, h: 0.3, margin: 0, fontFace: FONT, fontSize: 13 });
        addNotesAndFooter(slide, 1, notes[0], true);
    }

    // Slide 2 — problem loop
    {
        const slide = pptx.addSlide();
        slide.background = { color: C.paper };
        addSlideHeader(slide, 'Thực trạng', 'Một vòng lặp tạo thêm việc cho cả người dân và cán bộ');
        const cx = 6.66, cy = 3.93;
        const nodes = [
            { x: 1.0, y: 2.0, w: 3.15, title: 'Tìm sai địa chỉ', body: 'Người dân loay hoay tìm đúng trụ sở.', icon: icons.route.blue },
            { x: 1.0, y: 4.72, w: 3.15, title: 'Chuẩn bị sai thủ tục', body: 'Thiếu hoặc sai giấy tờ cần thiết.', icon: icons.file.blue },
            { x: 9.18, y: 4.72, w: 3.15, title: 'Phải đi lại nhiều lần', body: 'Mất thêm thời gian để bổ sung, điều chỉnh.', icon: icons.repeat.blue },
            { x: 9.18, y: 2.0, w: 3.15, title: 'Giải đáp lặp lại', body: 'Cán bộ tiếp tục trả lời các câu hỏi giống nhau.', icon: icons.staff.teal },
        ];
        addConnectorArrow(slide, 4.12, 2.74, 5.72, 3.48, { color: C.blue, width: 1.7 });
        addConnectorArrow(slide, 5.72, 4.38, 4.12, 5.1, { color: C.blue, width: 1.7 });
        addConnectorArrow(slide, 4.12, 5.54, 9.1, 5.54, { color: C.blue, width: 1.7 });
        addConnectorArrow(slide, 9.18, 5.05, 7.61, 4.38, { color: C.blue, width: 1.7 });
        addConnectorArrow(slide, 7.61, 3.48, 9.18, 2.75, { color: C.blue, width: 1.7 });
        addConnectorArrow(slide, 9.18, 2.42, 4.12, 2.42, { color: C.blue, width: 1.7 });
        nodes.forEach((node, index) => {
            slide.addShape(pptx.ShapeType.roundRect, { x: node.x, y: node.y, w: node.w, h: 1.18, rectRadius: 0.08, fill: { color: C.white }, line: { color: index === 3 ? 'B6D9D5' : C.border, width: 1 }, shadow: shadow(0.08, 4, 1) });
            addIcon(slide, node.icon, node.x + 0.2, node.y + 0.23, 0.62, index === 3 ? C.teal : C.paleBlue, 0.27);
            slide.addText(node.title, { x: node.x + 0.98, y: node.y + 0.19, w: 1.95, h: 0.3, margin: 0, fontFace: FONT, fontSize: 16.2, bold: true, color: C.ink });
            slide.addText(node.body, { x: node.x + 0.98, y: node.y + 0.56, w: 1.95, h: 0.43, margin: 0, fontFace: FONT, fontSize: 12.3, color: C.slate });
        });
        slide.addShape(pptx.ShapeType.ellipse, { x: cx - 1.05, y: cy - 0.8, w: 2.1, h: 1.6, fill: { color: C.deep }, line: { color: C.blue, width: 2 }, shadow: shadow(0.16, 6, 2) });
        slide.addText('LẶP LẠI', { x: cx - 0.9, y: cy - 0.18, w: 1.8, h: 0.36, margin: 0, fontFace: FONT, fontSize: 24, bold: true, charSpacing: 1.2, color: C.white, align: 'center' });
        slide.addText('PHÍA NGƯỜI DÂN', { x: 1.0, y: 1.64, w: 3.2, h: 0.2, margin: 0, fontFace: FONT, fontSize: 10.5, bold: true, charSpacing: 1.5, color: C.blue });
        slide.addText('PHÍA CÁN BỘ', { x: 9.18, y: 1.64, w: 3.2, h: 0.2, margin: 0, fontFace: FONT, fontSize: 10.5, bold: true, charSpacing: 1.5, color: C.teal, align: 'right' });
        slide.addText('Ghi nhận từ thực tế công tác, chưa có số liệu thống kê chính thức.', { x: M, y: 6.66, w: W - 2 * M, h: 0.28, margin: 0, fontFace: FONT, fontSize: 12.5, italic: true, color: C.muted, align: 'center' });
        addNotesAndFooter(slide, 2, notes[1]);
    }

    // Slide 3 — citizen need statement
    {
        const slide = pptx.addSlide();
        slide.background = { color: C.paper };
        slide.addText('NHU CẦU CỦA NGƯỜI DÂN', { x: M, y: 0.62, w: 5, h: 0.26, margin: 0, fontFace: FONT, fontSize: 12.5, bold: true, charSpacing: 2.1, color: C.blue });
        slide.addText([
            { text: 'Người dân cần được hướng dẫn\n', options: { color: C.ink } },
            { text: 'chính xác', options: { color: C.teal, bold: true } },
            { text: ' trước khi đến\n', options: { color: C.ink } },
            { text: 'làm thủ tục.', options: { color: C.ink } },
        ], { x: M, y: 1.28, w: 8.15, h: 3.2, margin: 0, fontFace: FONT, fontSize: 39, bold: true, breakLine: false, valign: 'mid' });
        slide.addShape(pptx.ShapeType.line, { x: 8.82, y: 1.28, w: 0, h: 4.5, line: { color: C.border, width: 1 } });
        const journey = [
            { icon: icons.citizen.white, label: 'Người dân' },
            { icon: icons.phone.white, label: 'Điện thoại' },
            { icon: icons.pin.white, label: 'Đúng địa chỉ' },
            { icon: icons.station.white, label: 'Đúng trụ sở' },
        ];
        journey.forEach((item, index) => {
            const x = 9.25 + (index % 2) * 1.72;
            const y = 1.63 + Math.floor(index / 2) * 2.05;
            if (index === 0) addConnectorArrow(slide, 9.94, 2.05, 10.84, 2.05, { color: C.blue });
            if (index === 2) addConnectorArrow(slide, 9.94, 4.1, 10.84, 4.1, { color: C.teal });
            if (index === 1) addConnectorArrow(slide, 11.55, 2.44, 11.55, 3.48, { color: C.blue });
            addIcon(slide, item.icon, x, y, 0.82, index >= 2 ? C.teal : C.blue, 0.27);
            slide.addText(item.label, { x: x - 0.28, y: y + 1.0, w: 1.38, h: 0.28, margin: 0, fontFace: FONT, fontSize: 12.5, bold: true, color: C.slate, align: 'center' });
        });
        slide.addText('Nhu cầu thường gặp của người dân', { x: M, y: 5.28, w: 5.5, h: 0.28, margin: 0, fontFace: FONT, fontSize: 13, italic: true, color: C.muted });
        addNotesAndFooter(slide, 3, notes[2]);
    }

    // Slide 4 — product showcase
    {
        const slide = pptx.addSlide();
        slide.background = { color: C.paper };
        addSlideHeader(slide, 'Giải pháp', 'Một điểm chạm để tra cứu đúng nơi và hỏi đúng thủ tục', { titleWidth: 11.9, titleSize: 28 });
        slide.addText('BẢN ĐỒ CÔNG AN SỐ', { x: M, y: 1.67, w: 3.55, h: 0.32, margin: 0, fontFace: FONT, fontSize: 12, bold: true, charSpacing: 1.6, color: C.blue });
        slide.addText('Bản đồ tương tác\n+ Trợ lý ảo AI', { x: M, y: 2.08, w: 3.55, h: 1.18, margin: 0, fontFace: FONT, fontSize: 26, bold: true, color: C.ink });
        const features = [
            { icon: icons.map.white, title: 'Bản đồ tương tác', body: 'Định vị mạng lưới trụ sở trên nền OpenStreetMap.', y: 3.48, color: C.blue },
            { icon: icons.ai.white, title: 'Trợ lý ảo AI', body: 'Tư vấn thủ tục hành chính, giải đáp 24/7.', y: 4.75, color: C.teal },
        ];
        features.forEach((item) => {
            addIcon(slide, item.icon, M, item.y, 0.62, item.color, 0.27);
            slide.addText(item.title, { x: 1.48, y: item.y + 0.01, w: 2.6, h: 0.28, margin: 0, fontFace: FONT, fontSize: 17, bold: true, color: C.ink });
            slide.addText(item.body, { x: 1.48, y: item.y + 0.36, w: 2.52, h: 0.48, margin: 0, fontFace: FONT, fontSize: 12.8, color: C.slate });
        });
        addBrowserMockup(slide, CONFIG.desktop, 4.32, 1.6, 8.36, 4.86);
        addConnectorArrow(slide, 6.23, 5.87, 6.75, 4.69, { color: C.blue, width: 1.2 });
        addStatusBadge(slide, 'Khu vực bản đồ', 4.6, 5.92, 1.72, false, false);
        addConnectorArrow(slide, 10.45, 5.88, 10.28, 4.35, { color: C.teal, width: 1.2 });
        addStatusBadge(slide, 'Khu vực chatbot', 10.0, 5.92, 1.86, true, false);
        slide.addText('Giao diện thử nghiệm trên máy tính', { x: 7.18, y: 6.62, w: 3.7, h: 0.2, margin: 0, fontFace: FONT, fontSize: 11, italic: true, color: C.muted, align: 'center' });
        addNotesAndFooter(slide, 4, notes[3]);
    }

    // Slide 5 — hero
    {
        const slide = pptx.addSlide();
        slide.background = { color: C.deepDark };
        addMapWatermark(slide, 8.7, 0.6, 3.75, 5.0, true);
        const flow = [
            ['CÂU HỎI', icons.citizen.white], ['TÀI LIỆU', icons.document.white], ['AI', icons.ai.white], ['KIỂM TRA', icons.shield.white], ['CÂU TRẢ LỜI', icons.source.white],
        ];
        flow.forEach((item, index) => {
            const x = 0.86 + index * 2.55;
            if (index < flow.length - 1) addConnectorArrow(slide, x + 0.68, 6.03, x + 2.27, 6.03, { color: '7890C4', width: 1, transparency: 42 });
            addIcon(slide, item[1], x, 5.7, 0.66, index >= 3 ? C.teal : C.deep, 0.29);
            slide.addText(item[0], { x: x - 0.3, y: 6.48, w: 1.28, h: 0.2, margin: 0, fontFace: FONT, fontSize: 9.5, bold: true, charSpacing: 0.8, color: 'AFC2E8', align: 'center' });
        });
        slide.addText('GIẢM RỦI RO\nTRẢ LỜI SAI', { x: M, y: 1.05, w: 7.2, h: 1.55, margin: 0, fontFace: FONT, fontSize: 46, bold: true, color: C.white });
        slide.addText('BẰNG', { x: M, y: 2.82, w: 1.2, h: 0.34, margin: 0, fontFace: FONT, fontSize: 14, bold: true, charSpacing: 2, color: 'AFC2E8' });
        slide.addText('DỮ LIỆU CÓ KIỂM SOÁT', { x: M, y: 3.22, w: 8.3, h: 0.66, margin: 0, fontFace: FONT, fontSize: 29, bold: true, color: C.teal });
        slide.addText('VÀ HẬU KIỂM.', { x: M, y: 4.1, w: 6.5, h: 0.66, margin: 0, fontFace: FONT, fontSize: 29, bold: true, color: C.teal });
        addIcon(slide, icons.shield.white, 9.92, 2.04, 1.28, C.teal, 0.27);
        addNotesAndFooter(slide, 5, notes[4], true);
    }

    // Slide 6 — control pipeline
    {
        const slide = pptx.addSlide();
        slide.background = { color: C.paper };
        addSlideHeader(slide, 'Cách tiếp cận kỹ thuật', '4 lớp kiểm soát nối tiếp để giảm rủi ro trả lời sai', { titleSize: 28.5 });
        const startX = 0.66, nodeY = 2.08, nodeW = 2.1, nodeH = 2.78, gap = 0.28;
        const nodes = [
            ['search', 'Truy hồi có kiểm soát', 'Ưu tiên nguồn đã rà soát, đúng thẩm quyền và cấp thực hiện.', false, 'ĐÃ KIỂM THỬ — CHỜ PHÊ DUYỆT'],
            ['filter', 'AI chấm điểm lại', 'Mô hình thứ hai loại tài liệu gần giống nhưng sai ngữ cảnh.', true, 'ĐANG HOẠT ĐỘNG'],
            ['document', 'Bám theo căn cứ', 'Thiếu căn cứ thì báo không đủ cơ sở, thay vì suy diễn.', false, 'ĐÃ KIỂM THỬ — CHỜ PHÊ DUYỆT'],
            ['shield', 'Hậu kiểm', 'Đối chiếu số điện thoại, địa chỉ và căn cứ pháp lý với nguồn.', true, 'ĐANG HOẠT ĐỘNG'],
        ];
        slide.addShape(pptx.ShapeType.roundRect, { x: startX, y: nodeY + 0.73, w: 1.18, h: 1.22, rectRadius: 0.08, fill: { color: C.deep }, line: { color: C.deep } });
        slide.addImage({ data: icons.citizen.white, x: startX + 0.4, y: nodeY + 0.96, w: 0.38, h: 0.38 });
        slide.addText('Câu hỏi\nngười dân', { x: startX + 0.12, y: nodeY + 1.42, w: 0.94, h: 0.38, margin: 0, fontFace: FONT, fontSize: 11.5, bold: true, color: C.white, align: 'center' });
        let x = 2.08;
        nodes.forEach((node, index) => {
            if (index === 0) addConnectorArrow(slide, 1.84, nodeY + 1.34, x - 0.1, nodeY + 1.34, { color: C.blue });
            if (index > 0) addConnectorArrow(slide, x - gap + 0.02, nodeY + 1.34, x - 0.06, nodeY + 1.34, { color: C.blue });
            addProcessNode(slide, icons[node[0]][node[3] ? 'white' : 'blue'], index + 1, node[1], node[2], x, nodeY, nodeW, nodeH, { active: node[3] });
            addStatusBadge(slide, node[4], x + 0.08, 5.05, nodeW - 0.16, node[3], false);
            x += nodeW + gap;
        });
        addConnectorArrow(slide, 11.32, nodeY + 1.34, 11.49, nodeY + 1.34, { color: C.teal });
        slide.addShape(pptx.ShapeType.roundRect, { x: 11.55, y: nodeY + 0.62, w: 1.12, h: 1.44, rectRadius: 0.08, fill: { color: C.paleTeal }, line: { color: C.teal, width: 1.2 } });
        slide.addImage({ data: icons.source.teal, x: 11.91, y: nodeY + 0.83, w: 0.4, h: 0.4 });
        slide.addText('Câu trả lời\nkèm nguồn', { x: 11.68, y: nodeY + 1.34, w: 0.86, h: 0.44, margin: 0, fontFace: FONT, fontSize: 11.3, bold: true, color: C.ink, align: 'center' });
        slide.addShape(pptx.ShapeType.roundRect, { x: M, y: 5.75, w: W - 2 * M, h: 0.85, rectRadius: 0.08, fill: { color: C.deepDark }, line: { color: C.deepDark } });
        slide.addText('HIỆN TRẠNG', { x: M + 0.25, y: 5.96, w: 1.2, h: 0.2, margin: 0, fontFace: FONT, fontSize: 11, bold: true, charSpacing: 1.5, color: 'AFC2E8' });
        slide.addText('Lớp 2, 4 đang hoạt động; lớp 1, 3 đã kiểm thử trên bản thử nghiệm và chờ phê duyệt áp dụng.', { x: M + 1.65, y: 5.9, w: 10.25, h: 0.35, margin: 0, fontFace: FONT, fontSize: 14.2, bold: true, color: C.white, valign: 'mid' });
        addNotesAndFooter(slide, 6, notes[5]);
    }

    // Slide 7 — video console
    {
        const slide = pptx.addSlide();
        slide.background = { color: C.paper };
        addSlideHeader(slide, 'Minh hoạ', 'Một câu hỏi được xử lý qua ba chặng rõ ràng');
        const x = 0.66, y = 1.62, w = 8.75, h = 4.92;
        slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.08, fill: { color: C.ink }, line: { color: C.ink }, shadow: shadow(0.18, 8, 2) });
        slide.addShape(pptx.ShapeType.rect, { x, y, w, h: 0.4, fill: { color: C.deepDark }, line: { color: C.deepDark } });
        slide.addText('SYSTEM CONSOLE · RAG PIPELINE', { x: x + 0.28, y: y + 0.12, w: 3.1, h: 0.15, margin: 0, fontFace: FONT, fontSize: 9.5, bold: true, charSpacing: 1.2, color: 'C9D8F5' });
        addStatusBadge(slide, 'Minh hoạ', x + w - 1.45, y + 0.03, 1.18, true, true);
        const videoExists = fs.existsSync(CONFIG.video);
        if (videoExists) {
            slide.addMedia({ type: 'video', path: CONFIG.video, x: x + 0.1, y: y + 0.5, w: w - 0.2, h: h - 0.6 });
        } else {
            console.warn(`[video] Thiếu video: ${CONFIG.video}`);
            slide.addShape(pptx.ShapeType.rect, { x: x + 0.1, y: y + 0.5, w: w - 0.2, h: h - 0.6, fill: { color: 'E9EEF7' }, line: { color: C.border, dash: 'dash' } });
            slide.addText(`CHƯA CÓ VIDEO\n${CONFIG.video}`, { x: x + 0.5, y: y + 2.1, w: w - 1, h: 0.8, fontFace: FONT, fontSize: 14, color: C.muted, align: 'center', valign: 'mid' });
        }
        const calls = [
            ['01', 'Tiếp nhận câu hỏi', 'Ghi nhận đúng nhu cầu người dân.'],
            ['02', 'Truy hồi và chọn lọc', 'Tìm tài liệu phù hợp, loại nhiễu.'],
            ['03', 'Trả lời kèm nguồn', 'Sinh câu trả lời có căn cứ đối chiếu.'],
        ];
        calls.forEach((call, index) => {
            const cy = 1.82 + index * 1.38;
            slide.addText(call[0], { x: 9.82, y: cy, w: 0.42, h: 0.25, margin: 0, fontFace: FONT, fontSize: 11, bold: true, color: C.teal });
            slide.addText(call[1], { x: 10.35, y: cy - 0.02, w: 2.25, h: 0.28, margin: 0, fontFace: FONT, fontSize: 16.2, bold: true, color: C.ink });
            slide.addText(call[2], { x: 10.35, y: cy + 0.38, w: 2.18, h: 0.52, margin: 0, fontFace: FONT, fontSize: 12.3, color: C.slate });
            if (index < 2) slide.addShape(pptx.ShapeType.line, { x: 10.03, y: cy + 0.45, w: 0, h: 0.85, line: { color: C.border, width: 1 } });
        });
        slide.addText('Video minh hoạ — nội dung câu hỏi và câu trả lời là ví dụ, không phải tư vấn chính thức.', { x: 9.78, y: 6.08, w: 2.82, h: 0.56, margin: 0, fontFace: FONT, fontSize: 11.3, italic: true, color: C.muted, align: 'left' });
        addNotesAndFooter(slide, 7, notes[6]);
    }

    // Slide 8 — phone showcase
    {
        const slide = pptx.addSlide();
        slide.background = { color: C.paper };
        addSlideHeader(slide, 'Tính năng vượt trội', 'Trải nghiệm được thiết kế cho điện thoại và vận hành thực tế', { titleSize: 28 });
        addConnectorArrow(slide, 3.72, 2.52, 4.25, 2.65, { color: C.blue, width: 1, arrow: false });
        addConnectorArrow(slide, 3.72, 5.32, 4.25, 5.05, { color: C.blue, width: 1, arrow: false });
        addConnectorArrow(slide, 10.4, 2.52, 8.72, 2.65, { color: C.teal, width: 1, arrow: false });
        addConnectorArrow(slide, 10.4, 5.32, 8.72, 5.05, { color: C.teal, width: 1, arrow: false });
        addDeviceMockup(slide, CONFIG.phoneChat, 4.18, 1.65, 2.0, 4.58, 'Hỏi đáp AI');
        addDeviceMockup(slide, CONFIG.phoneLookup, 6.7, 1.95, 2.0, 4.58, 'Tra cứu thủ tục');
        const callouts = [
            { x: 0.72, y: 1.96, icon: icons.citizen.blue, title: 'Thân thiện dễ dùng', body: 'Giao diện tối giản, tối ưu cho điện thoại.' },
            { x: 0.72, y: 4.74, icon: icons.globe.blue, title: 'Hỗ trợ ngoại ngữ', body: 'Tiếng Anh, Trung, Hàn cho người nước ngoài.' },
            { x: 10.38, y: 1.96, icon: icons.cloud.teal, title: 'Quản trị linh hoạt', body: 'Cán bộ cập nhật dữ liệu qua Google Sheets.' },
            { x: 10.38, y: 4.74, icon: icons.lock.teal, title: 'Bảo mật', body: 'Cloudflare Turnstile ngăn tấn công tự động.' },
        ];
        callouts.forEach((call, index) => {
            addIcon(slide, call.icon, call.x, call.y, 0.58, index < 2 ? C.paleBlue : C.paleTeal, 0.28);
            slide.addText(call.title, { x: call.x + 0.78, y: call.y - 0.01, w: 2.0, h: 0.28, margin: 0, fontFace: FONT, fontSize: 16, bold: true, color: C.ink });
            slide.addText(call.body, { x: call.x + 0.78, y: call.y + 0.36, w: 2.05, h: 0.58, margin: 0, fontFace: FONT, fontSize: 12.3, color: C.slate });
        });
        addNotesAndFooter(slide, 8, notes[7]);
    }

    // Slide 9 — metrics
    {
        const slide = pptx.addSlide();
        slide.background = { color: C.deep };
        addSlideHeader(slide, 'Giá trị có thể đo kiểm', 'Hai giá trị đã có thể trình bày trung thực', { dark: true });
        addMetricBlock(slide, 0.72, 1.72, 5.82, 4.52, '24/7', 'Tra cứu ngoài giờ hành chính, không phải chờ tới lượt.', true);
        slide.addShape(pptx.ShapeType.arc, { x: 4.05, y: 2.22, w: 1.55, h: 1.55, adjustPoint: 0.25, rotate: 0, fill: { color: C.deepDark, transparency: 100 }, line: { color: C.teal, width: 5 } });
        addConnectorArrow(slide, 4.82, 2.98, 5.27, 2.7, { color: C.white, width: 2, arrow: false });
        addConnectorArrow(slide, 4.82, 2.98, 4.82, 2.43, { color: C.white, width: 2, arrow: false });
        addMetricBlock(slide, 6.78, 1.72, 5.82, 4.52, '17–28 GIÂY', 'Thời gian phản hồi p95 trong kiểm thử nội bộ, tuỳ nhà cung cấp AI.', true);
        slide.addShape(pptx.ShapeType.line, { x: 7.35, y: 4.49, w: 4.56, h: 0, line: { color: '7890C4', width: 3 } });
        slide.addShape(pptx.ShapeType.ellipse, { x: 8.02, y: 4.34, w: 0.3, h: 0.3, fill: { color: C.teal }, line: { color: C.white, width: 1 } });
        slide.addShape(pptx.ShapeType.ellipse, { x: 11.42, y: 4.34, w: 0.3, h: 0.3, fill: { color: C.blue }, line: { color: C.white, width: 1 } });
        slide.addText('≈17 giây', { x: 7.5, y: 4.76, w: 1.35, h: 0.23, margin: 0, fontFace: FONT, fontSize: 12.5, bold: true, color: C.white, align: 'center' });
        slide.addText('Nhà cung cấp chính', { x: 7.25, y: 5.1, w: 1.85, h: 0.23, margin: 0, fontFace: FONT, fontSize: 10.5, color: 'C9D8F5', align: 'center' });
        slide.addText('≈28 giây', { x: 10.94, y: 4.76, w: 1.35, h: 0.23, margin: 0, fontFace: FONT, fontSize: 12.5, bold: true, color: C.white, align: 'center' });
        slide.addText('Khi chuyển sang dự phòng', { x: 10.66, y: 5.1, w: 1.95, h: 0.23, margin: 0, fontFace: FONT, fontSize: 10.5, color: 'C9D8F5', align: 'center' });
        slide.addShape(pptx.ShapeType.roundRect, { x: 2.18, y: 6.47, w: 8.96, h: 0.44, rectRadius: 0.06, fill: { color: C.deepDark }, line: { color: '36559B', width: 0.8 } });
        slide.addText('Số liệu từ kiểm thử nội bộ, chưa phải số liệu vận hành thực tế trên diện rộng.', { x: 2.38, y: 6.47, w: 8.56, h: 0.44, margin: 0, fontFace: FONT, fontSize: 12.5, bold: true, color: C.white, align: 'center', valign: 'mid' });
        addNotesAndFooter(slide, 9, notes[8], true);
    }

    // Slide 10 — limitations and remedies
    {
        const slide = pptx.addSlide();
        slide.background = { color: C.paper };
        addSlideHeader(slide, 'Thẳng thắn nhìn nhận', 'Mỗi hạn chế đều có một hướng khắc phục cụ thể', { titleSize: 28 });
        slide.addText('HẠN CHẾ CÒN TỒN TẠI', { x: 1.48, y: 1.58, w: 3.2, h: 0.2, margin: 0, fontFace: FONT, fontSize: 10.5, bold: true, charSpacing: 1.4, color: C.muted });
        slide.addText('HƯỚNG KHẮC PHỤC ĐỀ XUẤT', { x: 6.62, y: 1.58, w: 4.1, h: 0.2, margin: 0, fontFace: FONT, fontSize: 10.5, bold: true, charSpacing: 1.4, color: C.teal });
        const pairs = [
            ['AI vẫn có thể trả lời sai', 'Khuyến cáo “thông tin tham khảo”; nút báo lỗi; cán bộ rà soát định kỳ.'],
            ['Kho dữ liệu chưa được thẩm định chính thức', 'Đơn vị nghiệp vụ QLXNC, QLHC về TTXH rà soát và phê duyệt.'],
            ['Chưa có nguồn lực CNTT chuyên trách', 'Bố trí cán bộ CNTT tiếp nhận, duy trì và nâng cấp hệ thống.'],
            ['Chưa đồng thiết kế đầy đủ với cán bộ tiếp dân', 'Bổ sung tình huống thực tế và câu hỏi thường gặp tại quầy.'],
            ['Chưa kiểm thử trên diện rộng', 'Thí điểm phạm vi hẹp → đánh giá kết quả → mới nhân rộng toàn tỉnh.'],
        ];
        pairs.forEach((pair, index) => addProblemSolutionRow(slide, index + 1, pair[0], pair[1], 1.96 + index * 0.92, icons));
        slide.addText('Công trình đang trong giai đoạn hoàn thiện — báo cáo trung thực để hoàn thiện một cách thực chất.', { x: M, y: 6.63, w: W - 2 * M, h: 0.25, margin: 0, fontFace: FONT, fontSize: 12, italic: true, color: C.muted, align: 'center' });
        addNotesAndFooter(slide, 10, notes[9]);
    }

    // Slide 11 — conclusion and asks
    {
        const slide = pptx.addSlide();
        slide.background = { color: C.deepDark };
        addMapWatermark(slide, 9.7, 0.52, 2.85, 3.2, true);
        slide.addText('TẦM NHÌN THIẾT THỰC', { x: M, y: 0.43, w: 4.5, h: 0.24, margin: 0, fontFace: FONT, fontSize: 12, bold: true, charSpacing: 2, color: 'AFC2E8' });
        slide.addText('Một chính quyền số gần dân', { x: M, y: 0.8, w: 7.8, h: 0.7, margin: 0, fontFace: FONT, fontSize: 34, bold: true, color: C.white });
        const ecosystem = [
            ['Người dân', icons.citizen.white], ['Bản đồ số', icons.map.white], ['Trợ lý AI', icons.ai.white], ['Cơ quan Công an', icons.station.white],
        ];
        ecosystem.forEach((item, index) => {
            const x = 0.78 + index * 3.08;
            if (index < ecosystem.length - 1) {
                addConnectorArrow(slide, x + 1.83, 2.05, x + 2.82, 2.05, { color: '7890C4', width: 1.4 });
                addConnectorArrow(slide, x + 2.82, 2.24, x + 1.83, 2.24, { color: C.teal, width: 1.1 });
            }
            addIcon(slide, item[1], x, 1.7, 0.72, index === 2 ? C.teal : C.deep, 0.28);
            slide.addText(item[0], { x: x + 0.88, y: 1.9, w: 1.68, h: 0.3, margin: 0, fontFace: FONT, fontSize: 14, bold: true, color: C.white });
        });
        slide.addText('BA KIẾN NGHỊ ĐỂ CHUYỂN TỪ SẢN PHẨM THỬ NGHIỆM SANG THÍ ĐIỂM CÓ KIỂM SOÁT', { x: M, y: 3.1, w: 9.6, h: 0.22, margin: 0, fontFace: FONT, fontSize: 10.5, bold: true, charSpacing: 1.3, color: 'AFC2E8' });
        const asks = [
            ['01', 'Cho phép thí điểm', 'Với cấu hình kiểm soát đã kiểm thử.', icons.pilot.white],
            ['02', 'Thẩm định kho dữ liệu', 'Giao đơn vị nghiệp vụ rà soát nội dung.', icons.review.white],
            ['03', 'Bố trí nguồn lực', 'Cán bộ CNTT và kinh phí duy trì hạ tầng.', icons.people.white],
        ];
        asks.forEach((ask, index) => {
            const x = M + index * 4.05;
            slide.addShape(pptx.ShapeType.roundRect, { x, y: 3.54, w: 3.72, h: 1.65, rectRadius: 0.08, fill: { color: index === 0 ? C.teal : C.deep }, line: { color: index === 0 ? C.teal : '36559B', width: 1 } });
            slide.addText(ask[0], { x: x + 0.22, y: 3.78, w: 0.45, h: 0.25, margin: 0, fontFace: FONT, fontSize: 11, bold: true, color: 'C9D8F5' });
            slide.addImage({ data: ask[3], x: x + 3.05, y: 3.75, w: 0.34, h: 0.34 });
            slide.addText(ask[1], { x: x + 0.22, y: 4.18, w: 3.0, h: 0.32, margin: 0, fontFace: FONT, fontSize: 17, bold: true, color: C.white });
            slide.addText(ask[2], { x: x + 0.22, y: 4.6, w: 3.0, h: 0.38, margin: 0, fontFace: FONT, fontSize: 12.3, color: 'DCE6F8' });
        });
        const phases = ['THÍ ĐIỂM', 'ĐÁNH GIÁ', 'HOÀN THIỆN', 'NHÂN RỘNG'];
        phases.forEach((phase, index) => {
            const x = 1.1 + index * 3.0;
            if (index < phases.length - 1) addConnectorArrow(slide, x + 1.68, 5.95, x + 2.7, 5.95, { color: C.teal, width: 1.5 });
            slide.addText(phase, { x, y: 5.77, w: 1.68, h: 0.36, margin: 0, fontFace: FONT, fontSize: 11.5, bold: true, charSpacing: 0.8, color: C.white, align: 'center', valign: 'mid' });
        });
        slide.addText('Xin trân trọng cảm ơn các đồng chí Lãnh đạo!', { x: M, y: 6.62, w: W - 2 * M, h: 0.26, margin: 0, fontFace: FONT, fontSize: 13, italic: true, color: 'C9D8F5', align: 'right' });
        addNotesAndFooter(slide, 11, notes[10], true);
    }

    await pptx.writeFile({ fileName: CONFIG.output });
    await applyTransitions(CONFIG.output, [5, 6, 9]);
    console.log(`OK: 11 slides → ${CONFIG.output}`);
    console.log(`Assets: desktop=${fs.existsSync(CONFIG.desktop)} phoneChat=${fs.existsSync(CONFIG.phoneChat)} phoneLookup=${fs.existsSync(CONFIG.phoneLookup)} video=${fs.existsSync(CONFIG.video)}`);
}

build().catch((error) => {
    console.error(error);
    process.exit(1);
});
