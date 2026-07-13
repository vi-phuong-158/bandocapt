const { test, expect } = require('@playwright/test');

const FULL_PROCEDURE_ANSWER = [
    '**Có, bạn cần chuẩn bị hồ sơ theo hướng dẫn dưới đây.**',
    '',
    '**📋 Hồ sơ cần chuẩn bị**',
    '',
    '- Hộ chiếu (bản chính)',
    '- Tờ khai mẫu NA5',
    '',
    '**📝 Trình tự thực hiện**',
    '',
    '1. Nộp hồ sơ trực tiếp hoặc qua Cổng Dịch vụ công.',
    '2. Thời gian giải quyết: 05 ngày làm việc.',
    '',
    '**📍 Nơi nộp & đường đi**',
    '',
    'Có 3 điểm tiếp dân: Phú Thọ cũ, Vĩnh Phúc cũ và Hòa Bình cũ.',
    '',
    'Bạn thuộc khu vực nào (Phú Thọ cũ, Vĩnh Phúc cũ hay Hòa Bình cũ)?',
].join('\n');

const NARROW_ANSWER = [
    '**Có, cần mẫu NA5 (Thông tư 22/2023/TT-BCA).**',
    '',
    'Bạn cần mình hướng dẫn đầy đủ hồ sơ và cách thực hiện không?',
].join('\n');

const PLAIN_ANSWER = 'Điểm tiếp dân Phú Thọ cũ: Khu E, Công an tỉnh Phú Thọ, phường Việt Trì.';

async function openChatWithStub(page, answers) {
    // marked/DOMPurify nạp từ CDN — môi trường CI/container có thể chặn CDN, nên shim bản tối
    // thiểu đủ render block markdown của stub (p/ul/ol + bold). Nếu CDN tải được, bản thật sẽ
    // ghi đè shim sau (script defer) và test vẫn chạy y hệt với thư viện thật.
    await page.addInitScript(() => {
        window.DOMPurify = window.DOMPurify || { sanitize: html => html, addHook() {} };
        window.marked = window.marked || {
            parse(md) {
                const blocks = String(md).split(/\n\s*\n/);
                const inline = s => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                return blocks.map(block => {
                    const lines = block.split('\n').filter(Boolean);
                    if (lines.every(l => l.startsWith('- '))) {
                        return '<ul>' + lines.map(l => `<li>${inline(l.slice(2))}</li>`).join('') + '</ul>';
                    }
                    if (lines.every(l => /^\d+\.\s/.test(l))) {
                        return '<ol>' + lines.map(l => `<li>${inline(l.replace(/^\d+\.\s/, ''))}</li>`).join('') + '</ol>';
                    }
                    return `<p>${inline(lines.join(' '))}</p>`;
                }).join('\n');
            },
        };
    });
    await page.goto('/');
    await page.waitForFunction(() => typeof window.marked !== 'undefined' && typeof window.DOMPurify !== 'undefined');
    await page.evaluate((stubAnswers) => {
        window.__stubAnswers = stubAnswers;
        window.GeminiAI = {
            stream: async (text, history, onChunk) => {
                const stub = window.__stubAnswers.shift() || 'Hết dữ liệu stub.';
                const answer = typeof stub === 'string' ? stub : stub.fullText;
                onChunk(answer);
                return {
                    ok: true,
                    fullText: answer,
                    history: [],
                    sources: typeof stub === 'string' ? [] : (stub.sources || []),
                    verifiedLocations: typeof stub === 'string' ? [] : (stub.verifiedLocations || []),
                    truncated: false,
                    finishReason: 'STOP'
                };
            },
            getError: () => 'stub',
        };
    }, answers);
    await page.click('#ai-chat-toggle-btn');
    await expect(page.locator('#ai-chat-window')).toHaveClass(/ai-chat-window--visible/);
}

async function sendMessage(page, text) {
    await page.fill('#fakeChatInput', text);
    await page.click('#chatSendBtn');
}

test('full-procedure answer collapses Hồ sơ/Trình tự into accordions, keeps Nơi nộp visible', async ({ page }) => {
    await openChatWithStub(page, [FULL_PROCEDURE_ANSWER]);
    await sendMessage(page, 'Gia hạn visa cần chuẩn bị gì?');

    const details = page.locator('.ai-chat-details');
    await expect(details).toHaveCount(2);
    await expect(details.nth(0).locator('summary')).toContainText('📋 Hồ sơ cần chuẩn bị');
    await expect(details.nth(1).locator('summary')).toContainText('📝 Trình tự thực hiện');

    // Mặc định đóng — nội dung chi tiết ẩn, đáp án chính và Nơi nộp luôn hiện
    await expect(details.nth(0)).not.toHaveAttribute('open', '');
    await expect(page.locator('.ai-chat-content').last()).toContainText('📍 Nơi nộp & đường đi');
    await expect(page.locator('.ai-chat-content').last()).toContainText('Có, bạn cần chuẩn bị hồ sơ');
    await expect(page.getByText('Hộ chiếu (bản chính)')).toBeHidden();

    // Bấm mở accordion → nội dung hiện
    await details.nth(0).locator('summary').click();
    await expect(page.getByText('Hộ chiếu (bản chính)')).toBeVisible();
});

test('region question renders 3 quick-reply chips; clicking one sends the reply and clears chips', async ({ page }) => {
    await openChatWithStub(page, [FULL_PROCEDURE_ANSWER, PLAIN_ANSWER]);
    await sendMessage(page, 'Gia hạn visa nộp ở đâu?');

    const chips = page.locator('.ai-chat-quick-reply');
    await expect(chips).toHaveCount(3);
    await expect(chips.nth(0)).toHaveText('Phú Thọ cũ');

    await chips.nth(0).click();
    // Chip gửi đúng nội dung như một tin nhắn user bình thường
    await expect(page.locator('.ai-chat-bubble--user').last()).toHaveText('Tôi ở khu vực Phú Thọ cũ');
    // Câu trả lời mới không có follow-up nhận diện được → chip cũ bị dọn, không còn chip nào
    await expect(page.locator('.ai-chat-quick-reply')).toHaveCount(0);
    await expect(page.locator('.ai-chat-content').last()).toContainText('Khu E, Công an tỉnh Phú Thọ');
});

test('narrow answer stays flat (no accordion) and offers the full-guidance chip', async ({ page }) => {
    await openChatWithStub(page, [NARROW_ANSWER]);
    await sendMessage(page, 'Gia hạn visa cần mẫu NA5 không?');

    await expect(page.locator('.ai-chat-content').last()).toContainText('Có, cần mẫu NA5');
    await expect(page.locator('.ai-chat-details')).toHaveCount(0);

    const chips = page.locator('.ai-chat-quick-reply');
    await expect(chips).toHaveCount(1);
    await expect(chips.first()).toContainText('Hướng dẫn đầy đủ hồ sơ');
});

test('answer renders procedure comparison and verified station direction deeplinks', async ({ page }) => {
    await openChatWithStub(page, [{
        fullText: 'Bạn có thể đối chiếu thủ tục và xem đường đến trụ sở bên dưới.',
        sources: [{
            file: 'Thủ tục hộ chiếu',
            procedure_id: 'id-cu-khong-con-trong-catalog',
            title: 'Cấp hộ chiếu phổ thông ở trong nước'
        }],
        verifiedLocations: [{
            name: 'Công an Phường Thanh Miếu',
            address: 'Số 1028 Đường Hùng Vương',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=21.304528,105.415528'
        }, {
            name: 'Điểm tiếp dân chưa có tọa độ',
            address: 'Khu E, Công an tỉnh Phú Thọ',
            mapsUrl: ''
        }]
    }]);
    await sendMessage(page, 'Tôi làm hộ chiếu ở Thanh Miếu');

    await expect(page.getByRole('button', { name: 'Đối chiếu trong danh mục' })).toBeVisible();
    const directions = page.getByRole('link', { name: 'Chỉ đường đến Công an Phường Thanh Miếu' });
    await expect(directions).toBeVisible();
    await expect(directions).toHaveAttribute('href', /google\.com\/maps\/search/);
    await expect(page.getByText('Chưa có tọa độ chỉ đường đã xác minh.')).toBeVisible();
});
