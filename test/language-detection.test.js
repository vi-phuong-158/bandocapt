'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const chat = require('../api/chat.js');

test('detectUserLanguage: câu tiếng Anh chứa "can" không bị nhận nhầm tiếng Việt', () => {
    // Trước T3.7: "can" trùng từ khóa tiếng Việt không dấu → nhận nhầm 'vi' → không dịch
    // truy hồi + trả lời sai ngôn ngữ (EN01 abstain trong shadow retrieval).
    assert.equal(chat.detectUserLanguage('How can a foreigner declare temporary residence in Phu Tho?'), 'en');
    assert.equal(chat.detectUserLanguage('Where can I get a passport?'), 'en');
    assert.equal(chat.detectUserLanguage('How to apply for a passport in Vietnam?'), 'en');
});

test('detectUserLanguage: giữ nhận đúng tiếng Việt (có dấu và không dấu)', () => {
    assert.equal(chat.detectUserLanguage('Tôi muốn gia hạn tạm trú'), 'vi');
    assert.equal(chat.detectUserLanguage('toi muon hoi thu tuc lam ho chieu'), 'vi'); // cụm "thu tuc"/"ho chieu"
    assert.equal(chat.detectUserLanguage('toi can lam can cuoc'), 'vi'); // cụm "can cuoc"
    assert.equal(chat.detectUserLanguage('toi ban can giup'), 'vi'); // 2+ từ đơn: toi, ban, can
});

test('detectUserLanguage: nhận đúng tiếng Trung và Hàn', () => {
    assert.equal(chat.detectUserLanguage('外国人如何申请临时居留证？'), 'zh');
    assert.equal(chat.detectUserLanguage('여권을 어떻게 신청하나요?'), 'ko');
});

test('translateQueryForRetrieval: no-op khi thiếu apiKey', async () => {
    assert.equal(await chat.translateQueryForRetrieval('How to apply', ''), null);
    assert.equal(await chat.translateQueryForRetrieval('', 'key'), null);
});
