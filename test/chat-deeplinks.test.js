'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const chat = require('../api/chat');

const ROOT = path.resolve(__dirname, '..');

test('API projects verified location records into deterministic deeplinks', () => {
    assert.deepEqual(chat.buildVerifiedLocationLinks([
        {
            name: 'Công an Phường Thanh Miếu',
            address: 'Số 1028 Đường Hùng Vương',
            googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=21.304528,105.415528',
            phone: '02103863928',
            internalField: 'must-not-leak',
        },
        { name: 'Thiếu URL', address: 'Địa chỉ đã xác minh' },
    ]), [{
        name: 'Công an Phường Thanh Miếu',
        address: 'Số 1028 Đường Hùng Vương',
        mapsUrl: 'https://www.google.com/maps/search/?api=1&query=21.304528,105.415528',
    }, {
        name: 'Thiếu URL',
        address: 'Địa chỉ đã xác minh',
        mapsUrl: '',
    }]);
});

test('chat client preserves location payload and renders deterministic direction links', () => {
    const gemini = fs.readFileSync(path.join(ROOT, 'js', 'gemini.js'), 'utf8');
    const chatbot = fs.readFileSync(path.join(ROOT, 'js', 'chatbot.js'), 'utf8');

    assert.match(gemini, /data\.verifiedLocations/);
    assert.match(gemini, /verifiedLocations, truncated/);
    assert.match(chatbot, /appendVerifiedLocations\(bubble, result\.verifiedLocations\)/);
    assert.match(chatbot, /locationItem\.href = location\.mapsUrl/);
    assert.match(chatbot, /loadCatalogModule[\s\S]*preload[\s\S]*appendCompareAction/);
    assert.match(chatbot, /resolveProcedureId/);
    assert.match(chatbot, /Chưa có tọa độ chỉ đường đã xác minh/);
});
