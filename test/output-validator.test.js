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

test('duration violations are log-only', () => {
    const result = validateAnswer('Thời gian là 05 ngày làm việc.', allowed({ legalCorpus: '' }));
    assert.equal(result.sanitizedText, 'Thời gian là 05 ngày làm việc.');
    assert.deepEqual(result.violations, [{
        tier: 2,
        type: 'duration',
        value: '05 ngày làm việc',
        action: 'log_only',
    }]);
});

test('redaction preserves surrounding Markdown and works in English and Chinese', () => {
    const result = validateAnswer('# Contact\n- **Phone:** 0210.384.3639\n- 费用 200 USD，表格 NA1a\n[Official](https://example.gov.vn)', allowed());
    assert.match(result.sanitizedText, /^# Contact/m);
    assert.match(result.sanitizedText, /\[Official\]\(https:\/\/example\.gov\.vn\)/);
    assert.doesNotMatch(result.sanitizedText, /0210\.384\.3639|200 USD|NA1a/);
});
