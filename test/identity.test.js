const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

test('Identity Requirements & CSP Compliance Test', () => {
    const indexPath = path.join(__dirname, '..', 'index.html');
    const chatbotPath = path.join(__dirname, '..', 'js', 'chatbot.js');
    const projectInfoScriptPath = path.join(__dirname, '..', 'js', 'project-info.js');

    const indexContent = fs.readFileSync(indexPath, 'utf-8');
    const chatbotContent = fs.readFileSync(chatbotPath, 'utf-8');
    const projectInfoScript = fs.readFileSync(projectInfoScriptPath, 'utf-8');

    // 1. Tên chủ thể
    assert.ok(
        indexContent.includes('Câu lạc bộ Đổi mới sáng tạo Tuổi trẻ Công an tỉnh Phú Thọ'),
        'Thiếu hoặc sai tên Câu lạc bộ'
    );

    // 2. URL Báo Phú Thọ và thuộc tính an toàn trên chính thẻ <a>
    const url = 'https://baophutho.vn/van-hanh-ung-dung-nbsp-ban-do-cong-an-so-tinh-phu-tho-258512.htm';
    assert.ok(indexContent.includes(url), 'Thiếu URL Báo Phú Thọ');

    // Trích xuất chính xác tất cả thẻ <a> có chứa URL Báo Phú Thọ
    const anchorRegex = /<a\s+[^>]*href=["']https:\/\/baophutho\.vn\/van-hanh-ung-dung-nbsp-ban-do-cong-an-so-tinh-phu-tho-258512\.htm["'][^>]*>/gi;
    const matchingAnchors = indexContent.match(anchorRegex);
    assert.ok(matchingAnchors && matchingAnchors.length > 0, 'Không tìm thấy thẻ <a> chứa URL Báo Phú Thọ');

    for (const anchorTag of matchingAnchors) {
        assert.ok(
            /target=["']_blank["']/i.test(anchorTag),
            `Thẻ <a> không chứa target="_blank": ${anchorTag}`
        );
        assert.ok(
            /rel=["']noopener noreferrer["']/i.test(anchorTag),
            `Thẻ <a> không chứa rel="noopener noreferrer": ${anchorTag}`
        );
    }

    // 3. Kiểm tra Nạp script external cho modal và không còn script inline
    assert.ok(
        indexContent.includes('<script src="js/project-info.js" defer></script>'),
        'index.html chưa nạp <script src="js/project-info.js" defer></script>'
    );

    // Kiểm tra không còn script nội tuyến chứa logic modal
    const inlineScriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = inlineScriptRegex.exec(indexContent)) !== null) {
        const scriptBody = match[1];
        // Bỏ qua thẻ script trỏ src bên ngoài (scriptBody rỗng hoặc chỉ có comment/whitespace)
        if (!match[0].includes('src=')) {
            assert.ok(!scriptBody.includes('project-info-btn'), 'Phát hiện inline script chứa project-info-btn trong index.html');
            assert.ok(!scriptBody.includes('openModal'), 'Phát hiện inline script chứa openModal trong index.html');
            assert.ok(!scriptBody.includes('closeModal'), 'Phát hiện inline script chứa closeModal trong index.html');
        }
    }

    // 4. Kiểm tra logic modal trong js/project-info.js
    assert.ok(projectInfoScript.includes('project-info-btn'), 'js/project-info.js thiếu xử lý project-info-btn');
    assert.ok(projectInfoScript.includes('project-info-close-btn'), 'js/project-info.js thiếu xử lý project-info-close-btn');
    assert.ok(projectInfoScript.includes('project-info-backdrop'), 'js/project-info.js thiếu xử lý project-info-backdrop');
    assert.ok(projectInfoScript.includes("e.key === 'Escape'"), 'js/project-info.js thiếu phím Escape');
    assert.ok(projectInfoScript.includes('aria-expanded'), 'js/project-info.js thiếu cập nhật aria-expanded');
    assert.ok(projectInfoScript.includes('aria-hidden'), 'js/project-info.js thiếu cập nhật aria-hidden');
    assert.ok(projectInfoScript.includes('.focus()'), 'js/project-info.js thiếu restore focus');

    // 5. Chatbot hiển thị đúng tên, lời chào và hướng dẫn
    assert.ok(chatbotContent.includes('Trợ lý tra cứu thủ tục và địa điểm'), 'Sai tên chatbot trong js');
    assert.ok(indexContent.includes('Trợ lý tra cứu thủ tục và địa điểm'), 'Sai tên chatbot trong html');
    
    assert.ok(chatbotContent.includes('Xin chào! Tôi có thể giúp bạn tìm thủ tục hành chính phù hợp và địa điểm thực hiện gần nhất.'), 'Sai lời chào trong js');
    assert.ok(indexContent.includes('Xin chào! Tôi có thể giúp bạn tìm thủ tục hành chính phù hợp và địa điểm thực hiện gần nhất.'), 'Sai lời chào trong html');
    
    const instructionText = 'Bạn chỉ cần mô tả thủ tục cần tìm; không cần nhập số CCCD, số điện thoại hoặc thông tin cá nhân.';
    assert.ok(chatbotContent.includes(instructionText), 'Sai hướng dẫn trong js');
    assert.ok(indexContent.includes(instructionText), 'Sai hướng dẫn trong html');

    // 6. Modal thông tin công trình IDs
    assert.ok(indexContent.includes('id="project-info-modal"'), 'Thiếu ID modal project-info-modal');
    assert.ok(indexContent.includes('id="project-info-close-btn"'), 'Thiếu nút đóng modal');
    assert.ok(indexContent.includes('id="project-info-backdrop"'), 'Thiếu backdrop');

    // 7. Không xuất hiện các từ cấm
    const forbiddenPhrases = [
        'cổng thông tin chính thức',
        'cổng dịch vụ công chính thức',
        'hệ thống tiếp nhận hồ sơ',
        'trợ lý chính thức',
        'cán bộ trực tuyến'
    ];

    for (const phrase of forbiddenPhrases) {
        assert.ok(
            !indexContent.toLowerCase().includes(phrase),
            `Phát hiện từ khóa cấm: ${phrase}`
        );
        assert.ok(
            !chatbotContent.toLowerCase().includes(phrase),
            `Phát hiện từ khóa cấm: ${phrase}`
        );
    }
});
