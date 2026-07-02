'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAnswer } = require('../lib/output-validator');

function allowed(overrides = {}) {
    return {
        phones: new Set(['0211.3.558.668']),
        mapsUrls: new Set(['https://www.google.com/maps/search/?api=1&query=21.308100,105.604200']),
        coords: new Set(['21.308100,105.604200']),
        legalCorpus: 'Lệ phí 145 USD. Mẫu NA5. Thông tư 28/2026/TT-BTC.',
        allowedConstants: ['12 giờ', '24 giờ'],
        ...overrides,
    };
}

test('keeps verified phone and redacts an unverified phone', () => {
    const result = validateAnswer('Gọi 0211.3.558.668 hoặc 0210.384.3639.', allowed());
    assert.match(result.sanitizedText, /0211\.3\.558\.668/);
    assert.doesNotMatch(result.sanitizedText, /0210\.384\.3639/);
    assert.equal(result.violations[0].type, 'phone');
});

test('keeps verified Maps URL and coordinates, removes unknown ones', () => {
    const good = 'https://www.google.com/maps/search/?api=1&query=21.308100,105.604200';
    const bad = 'https://www.google.com/maps/search/?api=1&query=20.123456,106.123456';
    const result = validateAnswer(`${good} 21.308100,105.604200 ${bad} 20.123456,106.123456`, allowed());
    assert.match(result.sanitizedText, /21\.308100,105\.604200/);
    assert.doesNotMatch(result.sanitizedText, /20\.123456,106\.123456/);
    assert.deepEqual(new Set(result.violations.map(item => item.type)), new Set(['maps_url', 'coords']));
});

test('validates fees and form codes against legal corpus', () => {
    const result = validateAnswer('Phí 145 USD, mẫu NA5; thêm 200 USD và NA1a.', allowed());
    assert.match(result.sanitizedText, /145 USD/);
    assert.match(result.sanitizedText, /NA5/);
    assert.doesNotMatch(result.sanitizedText, /200 USD|NA1a/);
});

test('validates legal references and preserves allowed time constants', () => {
    const result = validateAnswer('Thông tư 28/2026/TT-BTC; Thông tư 99/2099/TT-ABC. Trong 12 giờ hoặc 24 giờ.', allowed());
    assert.match(result.sanitizedText, /Thông tư 28\/2026\/TT-BTC/);
    assert.doesNotMatch(result.sanitizedText, /99\/2099/);
    assert.match(result.sanitizedText, /12 giờ.*24 giờ/);
});

test('keeps a legal reference when corpus differs only by optional so', () => {
    const result = validateAnswer('Thông tư 22/2023/TT-BCA', allowed({
        legalCorpus: 'Ban hành theo Thông tư số 22/2023/TT-BCA.',
    }));
    assert.equal(result.sanitizedText, 'Thông tư 22/2023/TT-BCA');
    assert.equal(result.violations.length, 0);
});

test('keeps full QH suffix from whitelist and cleanly redacts unknown references', () => {
    const result = validateAnswer('Luật số 47/2014/QH13; Thông tư 99/2099/TT-ABC.', allowed({
        legalCorpus: '',
        allowedConstants: ['47/2014'],
    }));
    assert.match(result.sanitizedText, /Luật số 47\/2014\/QH13/);
    assert.doesNotMatch(result.sanitizedText, /99\/2099|TT-ABC|\)13/);
    assert.equal(result.violations.length, 1);
});

test('redacts unsupported Chinese currency and form while keeping sourced USD', () => {
    const result = validateAnswer('费用25美元，材料按（NA1a格式）；已核实费用145 USD。', allowed());
    assert.doesNotMatch(result.sanitizedText, /25美元|NA1a/);
    assert.match(result.sanitizedText, /145 USD/);
});

test('redacts unsourced durations but keeps ones present in the legal corpus', () => {
    const result = validateAnswer('Thời gian là 05 ngày làm việc, 99 giờ, 3小时 và 4시간.', allowed({ legalCorpus: '', allowedConstants: [] }));
    assert.doesNotMatch(result.sanitizedText, /05 ngày làm việc|99 giờ|3小时|4시간/);
    assert.equal(result.violations.filter(item => item.type === 'duration').length, 4);
    assert.equal(result.violations.every(item => item.action === 'redact'), true);

    const kept = validateAnswer('Trong 12 giờ, 12 hours, 12小时 và 12시간.', allowed({
        legalCorpus: 'Thời hạn: 12 giờ. English: 12 hours. 中文：12小时。한국어: 12시간.',
        allowedConstants: [],
    }));
    assert.match(kept.sanitizedText, /12 giờ.*12 hours.*12小时.*12시간/);
    assert.equal(kept.violations.length, 0);
});

test('redacts unsourced physical measurements (photo size/file limit) but keeps sourced ones', () => {
    const result = validateAnswer('尺寸4×6cm，JPEG格式，≤2 MB。', allowed({ legalCorpus: '' }));
    assert.doesNotMatch(result.sanitizedText, /4×6cm|2 MB/);
    assert.equal(result.violations.filter(v => v.type === 'measurement').length, 2);

    const kept = validateAnswer('Kích thước 4x6cm.', allowed({ legalCorpus: 'Ảnh cỡ 4x6cm nền trắng.' }));
    assert.match(kept.sanitizedText, /4x6cm/);
    assert.equal(kept.violations.length, 0);
});

test('does not mangle "để" (Vietnamese word) after a bare number as if it were a money unit', () => {
    const result = validateAnswer('Gọi số 113 để được hỗ trợ. Tổng đài 1900 6142 để biết thêm.', allowed({ legalCorpus: '' }));
    assert.equal(result.sanitizedText, 'Gọi số 113 để được hỗ trợ. Tổng đài 1900 6142 để biết thêm.');
    assert.equal(result.violations.length, 0);
});

test('redacts an unsourced money range even though only the trailing number has a unit', () => {
    const result = validateAnswer('Phạt từ 3.000.000 đến 5.000.000 đồng.', allowed({ legalCorpus: '' }));
    assert.doesNotMatch(result.sanitizedText, /3\.000\.000|5\.000\.000/);
    assert.equal(result.violations.filter(v => v.type === 'money').length, 1);

    const kept = validateAnswer('Phạt từ 3.000.000 đến 5.000.000 đồng.', allowed({
        legalCorpus: 'Phạt tiền từ 3.000.000 đến 5.000.000 đồng đối với hành vi...',
    }));
    assert.match(kept.sanitizedText, /3\.000\.000 đến 5\.000\.000 đồng/);
});

test('redacts unsourced measurements written with Chinese units (厘米/毫米)', () => {
    const result = validateAnswer('尺寸4×6厘米，白底照片。', allowed({ legalCorpus: '' }));
    assert.doesNotMatch(result.sanitizedText, /4×6厘米/);
    assert.equal(result.violations.filter(v => v.type === 'measurement').length, 1);
});

test('redaction preserves surrounding Markdown and works in English and Chinese', () => {
    const result = validateAnswer('# Contact\n- **Phone:** 0210.384.3639\n- 费用 200 USD，表格 NA1a\n[Official](https://example.gov.vn)', allowed());
    assert.match(result.sanitizedText, /^# Contact/m);
    assert.match(result.sanitizedText, /\[Official\]\(https:\/\/example\.gov\.vn\)/);
    assert.doesNotMatch(result.sanitizedText, /0210\.384\.3639|200 USD|NA1a/);
});

test('trimToSentenceBoundary cuts a mid-sentence tail back to the last complete sentence', () => {
    const { trimToSentenceBoundary } = require('../lib/output-validator');
    const input = 'Bạn phải khai báo tạm trú trong 12 giờ. Hồ sơ gồm hộ chiếu và giấy tờ liên quan. Ngoài ra bạn cần chuẩn bị thê';
    assert.equal(
        trimToSentenceBoundary(input),
        'Bạn phải khai báo tạm trú trong 12 giờ. Hồ sơ gồm hộ chiếu và giấy tờ liên quan.'
    );
});

test('trimToSentenceBoundary keeps text that already ends at a sentence boundary', () => {
    const { trimToSentenceBoundary } = require('../lib/output-validator');
    const input = 'The declaration must be submitted within 12 hours.';
    assert.equal(trimToSentenceBoundary(input), input);
    const zh = '您必须在12小时内申报。然后等待系统确认！';
    assert.equal(trimToSentenceBoundary(zh), zh);
});

test('trimToSentenceBoundary drops an incomplete trailing bullet but keeps complete lines', () => {
    const { trimToSentenceBoundary } = require('../lib/output-validator');
    const input = '**📋 Hồ sơ cần chuẩn bị**\n- Hộ chiếu (bản chính)\n- Tờ khai mẫu NA5\n- Giấy tờ chứng minh mục đí';
    assert.equal(
        trimToSentenceBoundary(input),
        '**📋 Hồ sơ cần chuẩn bị**\n- Hộ chiếu (bản chính)\n- Tờ khai mẫu NA5'
    );
});

test('trimToSentenceBoundary does not mistake dots in URLs or decimals for sentence ends', () => {
    const { trimToSentenceBoundary } = require('../lib/output-validator');
    const input = 'Khai báo tại dichvucong.gov.vn nhé. Tọa độ 21.304528,105.415528 nằm trong link chỉ đườ';
    assert.equal(trimToSentenceBoundary(input), 'Khai báo tại dichvucong.gov.vn nhé.');
});

test('trimToSentenceBoundary returns a single unfinished sentence unchanged (no boundary to cut at)', () => {
    const { trimToSentenceBoundary } = require('../lib/output-validator');
    const input = 'Bạn cần chuẩn bị hộ chiếu và các giấy tờ liên qu';
    assert.equal(trimToSentenceBoundary(input), input);
});

test('getTruncationNotice localizes vi/zh/ko and falls back to English', () => {
    const { getTruncationNotice } = require('../lib/output-validator');
    assert.match(getTruncationNotice('vi'), /rút gọn do giới hạn độ dài/);
    assert.match(getTruncationNotice('zh'), /长度限制/);
    assert.match(getTruncationNotice('ko'), /길이 제한/);
    assert.match(getTruncationNotice('en'), /length limit/);
    assert.match(getTruncationNotice('fr'), /length limit/);
});
