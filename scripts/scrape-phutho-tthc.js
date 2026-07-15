'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASE_URL = 'https://congan.phutho.gov.vn/';
const START_URL = new URL('TTHC.aspx', BASE_URL).href;
const DEFAULT_OUTPUT = path.join(ROOT, 'data', 'tthc-phutho-source.json');
const DEFAULT_REVIEW_OUTPUT = path.join(ROOT, 'data', 'tthc-phutho-high-review.csv');
const GOVERNANCE_CSV = path.join(ROOT, 'data', 'corpus-governance-draft.csv');
const USER_AGENT = 'bandocapt-tthc-audit/1.0 (+https://github.com/vi-phuong-158/bandocapt)';

function decodeHtml(value = '') {
    const named = {
        amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
        ndash: '–', mdash: '—', hellip: '…', ldquo: '“', rdquo: '”'
    };
    return String(value)
        .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => {
            const number = code[0].toLowerCase() === 'x'
                ? Number.parseInt(code.slice(1), 16)
                : Number.parseInt(code, 10);
            return Number.isFinite(number) ? String.fromCodePoint(number) : _;
        })
        .replace(/&([a-z]+);/gi, (whole, name) => named[name.toLowerCase()] ?? whole);
}

function cleanText(value = '') {
    return decodeHtml(String(value)
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<\/\s*(?:p|li|tr|h[1-6]|div|ol|ul)\s*>/gi, '\n')
        .replace(/<[^>]+>/g, ' '))
        .replace(/\r/g, '')
        .replace(/[\t\f\v ]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function normalizeTitle(value = '') {
    return cleanText(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/\bthu tuc\s*:?\s*/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function normalizeComparableTitle(value = '') {
    return normalizeTitle(value)
        .replace(/\s+(?:thuc hien )?tai (?:cong an )?cap (?:tinh|xa)$/g, '')
        .trim();
}

function absoluteUrl(value, baseUrl = BASE_URL) {
    try {
        return new URL(decodeHtml(value), baseUrl).href;
    } catch {
        return '';
    }
}

function parseTableRows(html = '') {
    const fields = {};
    for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
            .map(match => cleanText(match[1]));
        if (cells.length >= 2 && cells[0]) fields[cells[0]] = cells.slice(1).join('\n').trim();
    }
    return fields;
}

function getField(fields, ...labels) {
    for (const label of labels) {
        const normalized = normalizeTitle(label);
        const key = Object.keys(fields).find(candidate => normalizeTitle(candidate) === normalized);
        if (key) return fields[key];
    }
    return '';
}

function parseSections(html = '') {
    const sections = {};
    const headings = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)];
    for (let index = 0; index < headings.length; index += 1) {
        const heading = cleanText(headings[index][1]);
        const start = headings[index].index + headings[index][0].length;
        const end = headings[index + 1]?.index ?? html.length;
        sections[heading] = cleanText(html.slice(start, end));
    }
    return sections;
}

function parseAttachments(html = '', pageUrl = BASE_URL) {
    const attachments = [];
    for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const href = absoluteUrl(match[1], pageUrl);
        if (!href || !/(?:\/data\/|\.(?:pdf|docx?|xlsx?|zip)(?:$|[?#]))/i.test(href)) continue;
        const linkText = cleanText(match[2]);
        const title = !linkText || /^(?:tải về|download)$/i.test(linkText)
            ? decodeURIComponent(path.basename(new URL(href).pathname))
            : linkText;
        attachments.push({ title, url: href });
    }
    return [...new Map(attachments.map(item => [item.url, item])).values()];
}

function detectRiskFlags(procedure) {
    const blob = [procedure.title, procedure.processing_time, procedure.legal_basis,
        procedure.steps, procedure.documents, procedure.requirements].join('\n');
    const flags = [];
    if (/phi[eế]u khai b[aá]o t[aạ]m tr[uú]|m[aẫ]u\s+NA17/i.test(blob)) flags.push('paper_flow_candidate');
    if (/24\s*gi[oờ]\s*\/\s*0?7\s*ng[aà]y/i.test(procedure.processing_time)) flags.push('ambiguous_processing_time');
    // Chỉ cờ mốc hiệu lực của chính sách/phí/thủ tục. Không bắt các câu mô tả
    // giấy tờ của người dân "đã hết hiệu lực" (ví dụ thẻ căn cước hết hạn).
    if (/áp dụng đến hết ngày|(?:thủ tục|quy định|văn bản|chính sách)[^\n.]{0,80}hết hiệu lực/i
        .test([procedure.processing_time, procedure.fee].join('\n'))) {
        flags.push('dated_validity_claim');
    }
    return flags;
}

function parseDetailPage(html, sourceUrl, listing = {}) {
    const fields = parseTableRows(html);
    const sections = parseSections(html);
    const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '';
    const title = cleanText(h1) || getField(fields, 'Tên thủ tục') || listing.title || '';
    const procedure = {
        site_id: sourceUrl.match(/-(\d+)-(\d+)(?:[/?#]|$)/)?.slice(1).join('-') || '',
        title,
        category: getField(fields, 'Lĩnh vực') || listing.category || '',
        level: listing.level || getField(fields, 'Cấp thực hiện') || '',
        service_level: listing.service_level || '',
        agency: getField(fields, 'Cơ quan thực hiện', 'Cơ quan xử lý'),
        processing_time: getField(fields, 'Thời hạn giải quyết'),
        fee: getField(fields, 'Lệ phí', 'Phí, lệ phí', 'Phí/lệ phí'),
        target_audience: getField(fields, 'Đối tượng thực hiện', 'Ðối tượng thực hiện'),
        result: getField(fields, 'Kết quả thực hiện'),
        legal_basis: getField(fields, 'Căn cứ pháp lý'),
        method: getField(fields, 'Cách thức thực hiện'),
        steps: sections['Trình tự thực hiện'] || '',
        documents: sections['Thành phần hồ sơ'] || '',
        requirements: sections['Yêu cầu, điều kiện'] || '',
        attachments: parseAttachments(html, sourceUrl),
        online_submission_url: [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
            .map(match => ({ url: absoluteUrl(match[1], sourceUrl), text: cleanText(match[2]) }))
            .find(link => /nộp hồ sơ trực tuyến/i.test(link.text))?.url || '',
        source_url: sourceUrl,
        source_name: 'Trang thông tin điện tử Công an tỉnh Phú Thọ'
    };
    procedure.risk_flags = detectRiskFlags(procedure);
    procedure.content_hash = crypto.createHash('sha256')
        .update(JSON.stringify(procedure))
        .digest('hex');
    return procedure;
}

function parseCategoryPage(html, pageUrl) {
    const rows = [];
    for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const body = row[1];
        const link = body.match(/<a\b[^>]*href\s*=\s*["']([^"']*\/article\/thu-tuc-hanh-chinh\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
        if (!link) continue;
        const readClass = className => cleanText(body.match(new RegExp(`<td\\b[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/td>`, 'i'))?.[1] || '');
        rows.push({
            source_url: absoluteUrl(link[1], pageUrl),
            title: cleanText(link[2]),
            category: readClass('linhvuc'),
            level: readClass('capthuchien'),
            service_level: readClass('mucdo')
        });
    }
    return rows;
}

function parseLandingPage(html, pageUrl = START_URL) {
    const links = [];
    for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']*thu-tuc-hanh-chinh\/[^"']+)["']/gi)) {
        if (/\/article\//i.test(match[1])) continue;
        links.push(absoluteUrl(match[1], pageUrl));
    }
    return [...new Set(links.filter(Boolean))];
}

function parseCsv(text) {
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (quoted) {
            if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
            else if (char === '"') quoted = false;
            else field += char;
        } else if (char === '"') quoted = true;
        else if (char === ',') { row.push(field); field = ''; }
        else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
        else field += char;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    const header = rows.shift() || [];
    return rows.filter(values => values.some(Boolean)).map(values => Object.fromEntries(header.map((key, index) => [key, values[index] || ''])));
}

function csvCell(value) {
    const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function titleScore(left, right) {
    const a = new Set(normalizeComparableTitle(left).split(' ').filter(Boolean));
    const b = new Set(normalizeComparableTitle(right).split(' ').filter(Boolean));
    if (!a.size || !b.size) return 0;
    const intersection = [...a].filter(token => b.has(token)).length;
    return intersection / new Set([...a, ...b]).size;
}

function isCompatibleLevel(cap, level) {
    const normalizedCap = normalizeTitle(cap);
    const normalizedLevel = normalizeTitle(level);
    if (normalizedCap === 'tinh') return /\bcap tinh\b/.test(normalizedLevel);
    if (normalizedCap === 'xa') return /\bcap xa\b/.test(normalizedLevel);
    if (normalizedCap === 'trung uong') return /\btrung uong\b|\bbo cong an\b|\bcuc\b/.test(normalizedLevel);
    return true;
}

function buildHighRiskReview(governanceRows, procedures) {
    return governanceRows.filter(row => row.review_tier === 'HIGH').map(row => {
        const exact = procedures.filter(item =>
            normalizeTitle(item.title) === normalizeTitle(row.title) && isCompatibleLevel(row.cap, item.level));
        let match = exact.length === 1 ? exact[0] : null;
        let method = match ? 'exact_title' : '';
        let score = match ? 1 : 0;
        if (!match) {
            const ranked = procedures
                .filter(item => isCompatibleLevel(row.cap, item.level))
                .map(item => ({ item, score: titleScore(row.title, item.title) }))
                .sort((a, b) => b.score - a.score);
            if (ranked[0]?.score >= 0.72) {
                match = ranked[0].item;
                score = Math.min(1, ranked[0].score);
                method = 'suggested_title';
            }
        }
        return {
            id: row.id,
            title: row.title,
            cap: row.cap,
            match_status: match ? (method === 'exact_title' ? 'matched' : 'review_suggestion') : 'unmatched',
            match_method: method,
            match_score: score ? score.toFixed(3) : '',
            source_title: match?.title || '',
            source_url: match?.source_url || '',
            source_content_hash: match?.content_hash || '',
            scraped_processing_time: match?.processing_time || '',
            scraped_fee: match?.fee || '',
            scraped_forms: match?.attachments?.map(item => item.title).join(' | ') || '',
            scraped_agency: match?.agency || '',
            risk_flags: match?.risk_flags || [],
            reviewer_note: match ? 'Nguồn tham khảo; chưa tự động phê duyệt.' : 'Không tìm thấy đối chiếu đủ tin cậy.'
        };
    });
}

function parseArgs(argv) {
    const options = { delayMs: 650, limit: 0, output: DEFAULT_OUTPUT, reviewOutput: DEFAULT_REVIEW_OUTPUT };
    for (const arg of argv) {
        if (arg.startsWith('--delay-ms=')) options.delayMs = Math.max(0, Number(arg.slice(11)) || 0);
        else if (arg.startsWith('--limit=')) options.limit = Math.max(0, Number(arg.slice(8)) || 0);
        else if (arg.startsWith('--output=')) options.output = path.resolve(ROOT, arg.slice(9));
        else if (arg.startsWith('--review-output=')) options.reviewOutput = path.resolve(ROOT, arg.slice(16));
        else throw new Error(`Tham số không hỗ trợ: ${arg}`);
    }
    return options;
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchText(url, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const response = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.text();
        } catch (error) {
            lastError = error;
            if (attempt < attempts) await wait(500 * attempt);
        }
    }
    throw new Error(`Không tải được ${url}: ${lastError?.message || 'unknown error'}`);
}

async function crawl(options) {
    const landingHtml = await fetchText(START_URL);
    const categoryUrls = parseLandingPage(landingHtml);
    const listings = [];
    for (const categoryUrl of categoryUrls) {
        await wait(options.delayMs);
        const html = await fetchText(categoryUrl);
        listings.push(...parseCategoryPage(html, categoryUrl));
        process.stdout.write(`Danh mục ${categoryUrls.indexOf(categoryUrl) + 1}/${categoryUrls.length}: ${listings.length} thủ tục\n`);
    }
    const uniqueListings = [...new Map(listings.map(item => [item.source_url, item])).values()];
    const selected = options.limit ? uniqueListings.slice(0, options.limit) : uniqueListings;
    const procedures = [];
    const errors = [];
    for (let index = 0; index < selected.length; index += 1) {
        const listing = selected[index];
        await wait(options.delayMs);
        try {
            procedures.push(parseDetailPage(await fetchText(listing.source_url), listing.source_url, listing));
        } catch (error) {
            errors.push({ source_url: listing.source_url, error: error.message });
        }
        if ((index + 1) % 10 === 0 || index + 1 === selected.length) {
            process.stdout.write(`Chi tiết ${index + 1}/${selected.length}; lỗi ${errors.length}\n`);
        }
    }
    return { categoryUrls, listings: uniqueListings, procedures, errors };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const result = await crawl(options);
    const fetchedAt = new Date().toISOString();
    const snapshot = {
        schema_version: 1,
        source_name: 'Trang thông tin điện tử Công an tỉnh Phú Thọ',
        source_url: START_URL,
        fetched_at: fetchedAt,
        reuse_notice: 'Khi sử dụng lại thông tin, ghi rõ nguồn Trang thông tin điện tử Công an tỉnh Phú Thọ.',
        governance_notice: 'Snapshot tham khảo cho T3.3; không tự động coi thủ tục là approved/current.',
        totals: {
            categories: result.categoryUrls.length,
            listed_procedures: result.listings.length,
            fetched_procedures: result.procedures.length,
            errors: result.errors.length
        },
        procedures: result.procedures,
        errors: result.errors
    };
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');

    const governanceRows = parseCsv(fs.readFileSync(GOVERNANCE_CSV, 'utf8'));
    const reviewRows = buildHighRiskReview(governanceRows, result.procedures);
    const columns = Object.keys(reviewRows[0] || {});
    const csv = [columns.join(','), ...reviewRows.map(row => columns.map(column => csvCell(row[column])).join(','))].join('\n') + '\n';
    fs.writeFileSync(options.reviewOutput, csv, 'utf8');

    console.log(JSON.stringify({
        output: path.relative(ROOT, options.output),
        review_output: path.relative(ROOT, options.reviewOutput),
        ...snapshot.totals,
        high_review: {
            rows: reviewRows.length,
            matched: reviewRows.filter(row => row.match_status === 'matched').length,
            suggestions: reviewRows.filter(row => row.match_status === 'review_suggestion').length,
            unmatched: reviewRows.filter(row => row.match_status === 'unmatched').length
        }
    }, null, 2));
}

if (require.main === module) {
    main().catch(error => {
        console.error('[scrape-phutho-tthc]', error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    buildHighRiskReview,
    cleanText,
    csvCell,
    detectRiskFlags,
    normalizeTitle,
    parseCategoryPage,
    parseCsv,
    parseDetailPage,
    parseLandingPage,
    isCompatibleLevel,
    normalizeComparableTitle,
    titleScore
};
