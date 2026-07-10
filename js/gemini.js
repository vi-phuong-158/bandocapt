function getApiUrl() {
    if (window.location.protocol === 'file:') {
        return 'http://localhost:3000/api/chat';
    }

    return `${window.location.origin}/api/chat`;
}

// --- Turnstile CAPTCHA — đọc token từ global (được init trong index.html) ---
function getTurnstileToken() {
    // Trả về token hiện tại, KHÔNG xóa hay reset ở đây.
    // Việc reset sẽ do app.js xử lý SAU KHI API call hoàn tất,
    // đảm bảo token mới sẵn sàng trước khi user gửi câu tiếp.
    return window._turnstileToken || null;
}

// Hàm tự động phục hồi khi Turnstile gặp sự cố (lỗi mạng, challenge fail, v.v.)
window.onTurnstileError = function () {
    console.warn('[turnstile] Turnstile gặp sự cố. Tiến hành tự động phục hồi...');

    const container = document.getElementById('turnstileContainer');
    if (container) container.style.display = 'flex';

    // Đợi 500ms cho hệ thống ổn định rồi mới reset
    // để tránh bị Cloudflare đánh dấu spam
    setTimeout(function () {
        try {
            if (window._turnstileWidgetId !== null && typeof turnstile !== 'undefined') {
                turnstile.reset(window._turnstileWidgetId);
            }
        } catch (e) {
            console.error('[turnstile] Không thể reset Turnstile:', e);
        }
    }, 500);
};

// Hàm reset Turnstile và đợi token mới (gọi từ app.js sau khi API call xong)
function resetTurnstileAndWaitForNewToken() {
    return new Promise((resolve) => {
        // Xóa token cũ
        window._turnstileToken = null;

        // QUAN TRỌNG: Hiện container Turnstile trước khi reset
        // Nếu container bị display:none, Cloudflare không thể chạy challenge → trả 401
        const container = document.getElementById('turnstileContainer');
        if (container) {
            container.style.display = 'flex';
        }

        let resolved = false;

        // Đăng ký callback 1 lần để nhận token mới
        window._onNewTurnstileToken = function(token) {
            if (resolved) return;
            resolved = true;
            window._onNewTurnstileToken = null;
            resolve(token);
        };

        // Reset widget
        if (window._turnstileWidgetId !== null && typeof turnstile !== 'undefined') {
            try {
                turnstile.reset(window._turnstileWidgetId);
            } catch (e) {
                console.error('[gemini.js] Turnstile reset error:', e);
                if (!resolved) { resolved = true; resolve(null); }
            }
        } else {
            if (!resolved) { resolved = true; resolve(null); }
        }

        // Timeout sau 15s nếu callback không bắn
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                window._onNewTurnstileToken = null;
                console.warn('[gemini.js] Turnstile reset timeout (15s)');
                resolve(null);
            }
        }, 15000);
    });
}

// Request signing — HMAC-SHA256 chống casual scraping. Dùng chung công thức với server
// (verifyRequestSignature trong api/chat.js) cho cả /api/chat lẫn /api/feedback.
async function signRequestToken(message, ts) {
    try {
        const encoder = new TextEncoder();
        const digestBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(message));
        const messageDigest = Array.from(new Uint8Array(digestBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
            .substring(0, 32);
        const originHost = window.location.hostname || 'localhost';
        const signData = `${ts}:${originHost}:${navigator.userAgent.length}:${messageDigest}`;
        // Signing key derived từ cùng công thức phía server để tránh false reject.
        const keyMaterial = `xnc-phu-tho:${originHost}:${navigator.userAgent.substring(0, 16)}`;
        const cryptoKey = await crypto.subtle.importKey(
            'raw', encoder.encode(keyMaterial), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(signData));
        return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        // Fallback nếu trình duyệt không hỗ trợ Web Crypto
        return btoa(`${ts}:${navigator.userAgent.length}:${message.length}`);
    }
}

async function callGeminiStream(userMessage, conversationHistory = [], onChunk, signal, onStatus) {
    // Lấy Turnstile token (đã được render sẵn từ lúc load trang)
    const captchaToken = getTurnstileToken();

    const requestBody = { userMessage, history: conversationHistory };
    if (captchaToken) requestBody.captchaToken = captchaToken;

    const controller = new AbortController();
    const requestTimeoutId = setTimeout(() => controller.abort(), 60000);
    let idleTimeoutId = null;
    const resetIdleTimeout = () => {
        clearTimeout(idleTimeoutId);
        idleTimeoutId = setTimeout(() => controller.abort(), 15000);
    };

    // Wire external signal — cho phép caller huỷ stream (nút Stop).
    if (signal) {
        if (signal.aborted) {
            controller.abort();
        } else {
            signal.addEventListener('abort', () => controller.abort(), { once: true });
        }
    }

    // Khai báo ngoài try để catch có thể trả partialText khi bị abort.
    let fullText = '';

    try {

        // Request signing — HMAC-SHA256 chống casual scraping
        const ts = Date.now();
        const reqToken = await signRequestToken(userMessage, ts);

        const response = await fetch(getApiUrl(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Request-Token': reqToken,
                'X-Request-Time': ts.toString(),
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });

        if (!response.ok) {
            const status = response.status;
            let errorCode = 'API_ERROR';
            if (status === 429) errorCode = 'RATE_LIMIT';
            else if (status === 503) errorCode = 'SERVICE_UNAVAILABLE';

            try {
                const errData = await response.json();
                if (errData.error) errorCode = errData.error;

                if (errData.detail) {
                    return { ok: false, error: errorCode, detail: errData.detail };
                }
            } catch (_) { }

            return { ok: false, error: errorCode };
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let sources = []; // UI-05: citation sources
        let history = null;
        let buffer = '';
        let gotDone = false;
        let truncated = false;
        let finishReason = '';

        while (true) {
            resetIdleTimeout();
            const { done, value } = await reader.read();
            if (done) break;
            resetIdleTimeout();

            buffer += decoder.decode(value, { stream: true });

            const events = buffer.split('\n\n');
            buffer = events.pop() || '';

            for (const event of events) {
                for (const line of event.split('\n')) {
                    if (!line.startsWith('data: ')) continue;
                    const jsonStr = line.slice(6).trim();
                    if (!jsonStr) continue;

                    try {
                        const data = JSON.parse(jsonStr);

                        if (data.error) {
                            return { ok: false, error: data.error };
                        }

                        if (data.status) {
                            // P3.1: event trạng thái pipeline (vd 'generating') — không phải text.
                            try { if (onStatus) onStatus(data.status); } catch (_) { }
                            continue;
                        }

                        if (data.done) {
                            gotDone = true;
                            fullText = data.fullText || fullText;
                            history = data.history;
                            if (data.sources) sources = data.sources; // UI-05
                            truncated = Boolean(data.truncated);
                            finishReason = data.finishReason || '';
                        } else if (data.text) {

                            fullText += data.text;
                            try {
                                if (onChunk) onChunk(data.text);
                            } catch (e) {
                                console.warn('onChunk error:', e);

                            }
                        }
                    } catch (_) { }
                }
            }
        }

        if (!fullText) {
            return { ok: false, error: 'NO_RESPONSE' };
        }

        if (!gotDone) {
            return {
                ok: false,
                error: 'STREAM_ERROR',
                detail: 'Luồng phản hồi kết thúc trước khi server gửi tín hiệu hoàn tất.',
                partialText: fullText
            };
        }

        return { ok: true, fullText, history, sources, truncated, finishReason };

    } catch (err) {
        if (err.name === 'AbortError') {
            // Trả partial text nếu đã nhận được một phần — chatbot.js sẽ hiển thị với notice "gián đoạn".
            if (fullText) return { ok: false, error: 'STREAM_ERROR', partialText: fullText };
            return { ok: false, error: 'TIMEOUT' };
        }
        if (err.name === 'TypeError' && err.message.includes('fetch')) {
            return { ok: false, error: 'NETWORK_ERROR' };
        }
        return { ok: false, error: 'UNKNOWN_ERROR', detail: err.message };
    } finally {
        clearTimeout(requestTimeoutId);
        clearTimeout(idleTimeoutId);
    }
}

function getFeedbackApiUrl() {
    if (window.location.protocol === 'file:') {
        return 'http://localhost:3000/api/feedback';
    }
    return `${window.location.origin}/api/feedback`;
}

// Gửi báo cáo / phản hồi của người dùng về một lượt trả lời của chatbot.
// payload: { turn_id, rating: 'up'|'down', category?, comment?, contact?, question?, answer?, sources?, lang? }
// Trả { ok: boolean, error?, detail? }.
async function callSendFeedback(payload) {
    try {
        const ts = Date.now();
        // Ký trên cùng chuỗi định danh lượt mà server kiểm (turn_id:rating).
        const reqToken = await signRequestToken(`${payload.turn_id}:${payload.rating}`, ts);

        const response = await fetch(getFeedbackApiUrl(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Request-Token': reqToken,
                'X-Request-Time': ts.toString(),
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            let detail;
            try {
                const errData = await response.json();
                detail = errData.detail;
            } catch (_) { }
            return { ok: false, error: response.status === 429 ? 'RATE_LIMIT' : 'API_ERROR', detail };
        }
        return { ok: true };
    } catch (err) {
        return { ok: false, error: 'NETWORK_ERROR', detail: err.message };
    }
}

function getErrorMessage(errorCode, lang = 'vi') {
    if (errorCode === 'RATE_LIMIT_EXCEEDED') errorCode = 'RATE_LIMIT';
    const messages = {
        'vi': {
            'NO_KEY': '⚠️ Chưa có API Key. Vui lòng nhập Gemini API Key để sử dụng trợ lý AI thực.',
            'INVALID_KEY': '❌ API Key không hợp lệ hoặc đã hết hạn. Vui lòng kiểm tra lại.',
            'RATE_LIMIT': '⏳ Rất xin lỗi, hiện tại đang có quá nhiều người truy cập nên hệ thống tạm thời quá tải. <br><br>Bạn hãy dùng thử <a href="https://notebooklm.google.com/notebook/03f2338f-f7f7-4adf-aba3-52b93672b484" target="_blank" class="px-2 py-1 bg-green-100 text-green-800 rounded font-bold hover:bg-green-200 transition-colors inline-block mt-1">Sổ tay AI</a> để tiếp tục câu hỏi nhé!',
            'BLOCKED_CONTENT': '🚫 Câu hỏi này không phù hợp. Vui lòng hỏi về các quy định pháp luật, thủ tục hành chính.',
            'NETWORK_ERROR': '📡 Lỗi kết nối mạng. Vui lòng kiểm tra internet và thử lại.',
            'SERVICE_UNAVAILABLE': '🔧 Dịch vụ Gemini AI tạm thời không khả dụng. Vui lòng thử lại sau.',
            'NO_RESPONSE': '🤔 Không nhận được phản hồi từ AI. Vui lòng thử lại.',
            'STREAM_ERROR': '⚠️ Kết nối bị gián đoạn. Vui lòng thử lại.',
            'TIMEOUT': '⏳ Phản hồi quá lâu (Timeout). Vui lòng thử lại.',
            'DEFAULT': '❌ Có lỗi xảy ra. Vui lòng thử lại.'
        },
        'kr': {
            'NO_KEY': '⚠️ API Key가 없습니다. Gemini API Key를 입력해 주세요.',
            'INVALID_KEY': '❌ 유효하지 않거나 만료된 API Key입니다.',
            'RATE_LIMIT': '⏳ 죄송합니다. 현재 접속자가 많아 시스템이 지연되고 있습니다. <br><br>대신 <a href="https://notebooklm.google.com/notebook/03f2338f-f7f7-4adf-aba3-52b93672b484" target="_blank" class="px-2 py-1 bg-green-100 text-green-800 rounded font-bold hover:bg-green-200 transition-colors inline-block mt-1">AI 수첩 (Sổ tay AI)</a>을 사용하여 질문을 계속해 주세요!',
            'BLOCKED_CONTENT': '🚫 이 질문에는 답변할 수 없습니다. 출입국 관련 법률에 대해 질문해 주세요.',
            'NETWORK_ERROR': '📡 네트워크 오류. 인터넷 연결을 확인해 주세요.',
            'SERVICE_UNAVAILABLE': '🔧 서비스를 일시적으로 사용할 수 없습니다.',
            'STREAM_ERROR': '⚠️ 연결이 중단되었습니다. 다시 시도해 주세요.',
            'TIMEOUT': '⏳ 응답 시간 초과. 다시 시도해 주세요.',
            'DEFAULT': '❌ 오류가 발생했습니다. 다시 시도해 주세요.'
        },
        'en': {
            'NO_KEY': '⚠️ No API Key set. Please enter your Gemini API Key to use real AI.',
            'INVALID_KEY': '❌ Invalid or expired API Key. Please check and re-enter.',
            'RATE_LIMIT': '⏳ We apologize, but our system is currently experiencing high traffic. <br><br>Please try our <a href="https://notebooklm.google.com/notebook/03f2338f-f7f7-4adf-aba3-52b93672b484" target="_blank" class="px-2 py-1 bg-green-100 text-green-800 rounded font-bold hover:bg-green-200 transition-colors inline-block mt-1">AI Notebook (Sổ tay AI)</a> to continue your questions!',
            'BLOCKED_CONTENT': '🚫 This question is not within scope. Please ask about immigration or exit-entry regulations.',
            'NETWORK_ERROR': '📡 Network error. Please check your internet connection.',
            'SERVICE_UNAVAILABLE': '🔧 Gemini AI is temporarily unavailable. Please try again later.',
            'STREAM_ERROR': '⚠️ Connection interrupted. Please try again.',
            'TIMEOUT': '⏳ Request timeout. Please try again.',
            'DEFAULT': '❌ An error occurred. Please try again.'
        },
        'cn': {
            'NO_KEY': '⚠️ 尚未设置 API Key。请输入 Gemini API Key 以使用 AI。',
            'INVALID_KEY': '❌ API Key 无效或已过期。请检查后重新输入。',
            'RATE_LIMIT': '⏳ 非常抱歉，目前访问人数过多，系统暂时繁忙。<br><br>请尝试使用我们的 <a href="https://notebooklm.google.com/notebook/03f2338f-f7f7-4adf-aba3-52b93672b484" target="_blank" class="px-2 py-1 bg-green-100 text-green-800 rounded font-bold hover:bg-green-200 transition-colors inline-block mt-1">AI 笔记本 (Sổ tay AI)</a> 继续提问！',
            'BLOCKED_CONTENT': '🚫 此问题不在服务范围内。请询问有关法律法规的问题。',
            'NETWORK_ERROR': '📡 网络错误。请检查您的网络连接。',
            'SERVICE_UNAVAILABLE': '🔧 Gemini AI 服务暂时不可用。请稍后重试。',
            'STREAM_ERROR': '⚠️ 连接中断。请重试。',
            'TIMEOUT': '⏳ 请求超时。请重试。',
            'DEFAULT': '❌ 发生错误。请重试。'
        }
    };

    const langMessages = messages[lang] || messages['vi'];
    return langMessages[errorCode] || langMessages['DEFAULT'];
}

window.GeminiAI = {
    stream: callGeminiStream,
    sendFeedback: callSendFeedback,
    getError: getErrorMessage
};
