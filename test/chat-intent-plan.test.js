'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildRequestPlan } = require('../lib/chat-intent');

const locationFollowup = [
    { role: 'user', parts: [{ text: 'Tôi muốn làm căn cước, đến trụ sở nào?' }] },
    { role: 'model', parts: [{ text: 'Bạn ở xã/phường nào để mình chỉ đúng trụ sở Công an và đường đi nhé?' }] },
];

test('procedure and authority questions do not create a physical location task', () => {
    for (const query of [
        'Tôi muốn điều chỉnh thông tin sai trong Cơ sở dữ liệu quốc gia về dân cư. Có bắt buộc phải đến đúng Công an xã nơi thường trú không?',
        'Có bắt buộc phải về Công an xã nơi thường trú không?',
        'Quy định mới về Công an cấp xã trong thủ tục căn cước là gì?',
        'Căn cước nộp ở đâu theo thẩm quyền, xã hay tỉnh?',
        'Tôi ở phường Phú Thọ, lệ phí làm căn cước bao nhiêu?',
    ]) {
        const plan = buildRequestPlan(query, []);
        assert.equal(plan.locationTask, 'none', query);
        assert.equal(plan.isProcedureOrLegal, true, query);
    }
});

test('specific physical requests and mixed intent retain a location task', () => {
    const cases = [
        ['Công an phường Phú Thọ ở đâu?', 'find_station'],
        ['Số điện thoại Công an xã Bình Xuyên là gì?', 'contact'],
        ['Chỉ đường Google Maps đến Công an phường Phú Thọ.', 'directions'],
        ['Tôi ở phường Phú Thọ, muốn làm căn cước thì đến đâu?', 'find_station'],
        ['Tôi muốn làm căn cước, đến trụ sở nào?', 'find_station'],
    ];
    for (const [query, task] of cases) {
        const plan = buildRequestPlan(query, []);
        assert.equal(plan.locationTask, task, query);
    }
});

test('pending location follow-up accepts a place answer but clears on topic switch', () => {
    const place = buildRequestPlan('Phường Phú Thọ', locationFollowup);
    assert.equal(place.locationTask, 'find_station');
    assert.equal(place.reasons.includes('valid_location_followup'), true);

    const topicSwitch = buildRequestPlan('Nghị định 70 còn áp dụng nguyên văn không?', locationFollowup);
    assert.equal(topicSwitch.locationTask, 'none');
    assert.equal(topicSwitch.isProcedureOrLegal, true);
    assert.equal(topicSwitch.uncertainty.includes('topic_switch_clears_pending_location'), true);
});

test('a place mention alone is context, not a station lookup', () => {
    const plan = buildRequestPlan('Tôi ở phường Phú Thọ, lệ phí làm căn cước bao nhiêu?', []);
    assert.equal(plan.locationTask, 'none');
    assert.equal(plan.placeMention?.value, 'phường Phú Thọ');
});
