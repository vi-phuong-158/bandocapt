const assert = require('node:assert/strict');
const test = require('node:test');

const { shouldAttachEvalDebug, summarizeMatchForEval } = require('../api/chat');

const TOKEN = 'test-bypass-token';

// --------------------------------------------------------------------
// shouldAttachEvalDebug — ranh giới bảo mật của eval-mode output (T1.3)
// --------------------------------------------------------------------

test('BẢO MẬT: production KHÔNG lộ eval dù client gửi đủ token + evalDebug', () => {
    assert.equal(shouldAttachEvalDebug({
        nodeEnv: 'production',
        evalBypassToken: TOKEN,
        captchaToken: TOKEN,
        evalDebugFlag: true,
    }), false);
});

test('bật eval khi đủ 3 điều kiện: non-prod + token khớp + evalDebug=true', () => {
    assert.equal(shouldAttachEvalDebug({
        nodeEnv: 'development',
        evalBypassToken: TOKEN,
        captchaToken: TOKEN,
        evalDebugFlag: true,
    }), true);
});

test('không bật khi captchaToken không khớp EVAL_BYPASS_TOKEN', () => {
    assert.equal(shouldAttachEvalDebug({
        nodeEnv: 'development',
        evalBypassToken: TOKEN,
        captchaToken: 'người-dùng-thật',
        evalDebugFlag: true,
    }), false);
});

test('không bật khi EVAL_BYPASS_TOKEN chưa cấu hình', () => {
    assert.equal(shouldAttachEvalDebug({
        nodeEnv: 'development',
        evalBypassToken: undefined,
        captchaToken: undefined,
        evalDebugFlag: true,
    }), false);
});

test('không bật khi thiếu cờ evalDebug (mặc định)', () => {
    for (const flag of [undefined, false, 'true', 1, null]) {
        assert.equal(shouldAttachEvalDebug({
            nodeEnv: 'development',
            evalBypassToken: TOKEN,
            captchaToken: TOKEN,
            evalDebugFlag: flag,
        }), false, `evalDebugFlag=${String(flag)} phải cho false (chỉ boolean true mới bật)`);
    }
});

test('BẢO MẬT: production + token trống + evalDebug vẫn false (không có đường vòng)', () => {
    assert.equal(shouldAttachEvalDebug({
        nodeEnv: 'production',
        evalBypassToken: '',
        captchaToken: '',
        evalDebugFlag: true,
    }), false);
});

// --------------------------------------------------------------------
// summarizeMatchForEval — rút gọn match cho bộ chấm grounding (T1.5)
// --------------------------------------------------------------------

test('summarizeMatchForEval lấy đúng trường định danh + hiệu lực', () => {
    const out = summarizeMatchForEval({
        id: 'vec-123',
        score: 0.847213,
        _exactTokenBoost: true,
        metadata: {
            procedure_id: 'tthc_5568-01',
            source_type: 'tthc',
            source_file: 'qd-5568.json',
            title: 'Khai báo tạm trú',
            review_status: 'approved',
            valid_from: '2025-01-01',
            valid_to: null,
            supersedes: 'guide:old-01',
        },
    });
    assert.equal(out.id, 'vec-123');
    assert.equal(out.score, 0.8472); // làm tròn 4 chữ số
    assert.equal(out.procedure_id, 'tthc_5568-01');
    assert.equal(out.source_type, 'tthc');
    assert.equal(out.review_status, 'approved');
    assert.equal(out.supersedes, 'guide:old-01');
    assert.equal(out.exactTokenBoost, true);
});

test('summarizeMatchForEval fallback source_decision + null an toàn', () => {
    const out = summarizeMatchForEval({
        id: 'vec-9',
        score: 0.5,
        metadata: { source_decision: '5568/QD-BCA', loai_thu_tuc: 'cu_tru' },
    });
    assert.equal(out.procedure_id, '5568/QD-BCA'); // fallback khi thiếu procedure_id
    assert.equal(out.source_type, 'cu_tru');       // fallback loai_thu_tuc
    assert.equal(out.review_status, null);          // chưa có metadata hiệu lực (Giai đoạn 3)
    assert.equal(out.exactTokenBoost, false);
    assert.equal(summarizeMatchForEval(null), null);
});
