const assert = require('node:assert/strict');
const test = require('node:test');

const {
    countWords,
    VERBOSITY_LIMIT_NARROW,
    VERBOSITY_LIMIT_FULL,
} = require('../lib/regression-metrics');

test('regression word count handles whitespace and CJK text', () => {
    assert.equal(countWords('A short English answer.'), 4);
    assert.ok(countWords('您必须在12小时内申报。然后等待系统确认。') > 1);
});

test('regression verbosity limits match the answer-first prompt budgets', () => {
    assert.equal(VERBOSITY_LIMIT_NARROW, 120);
    assert.equal(VERBOSITY_LIMIT_FULL, 250);
});
