(function (root) {
    'use strict';

    const API_PATH = '/api/location-contributions';
    const form = document.getElementById('public-contribution-form');
    if (!form) return;
    const elements = {
        unit: document.getElementById('unit-code'), name: document.getElementById('location-name'), address: document.getElementById('address'),
        maps: document.getElementById('maps-url'), image: document.getElementById('location-image'), publicPhone: document.getElementById('public-phone'),
        submitterName: document.getElementById('submitter-name'), submitterPhone: document.getElementById('submitter-phone'), note: document.getElementById('note'),
        captcha: document.getElementById('public-turnstile-widget'), status: document.getElementById('public-contribution-status'), submit: document.getElementById('public-contribution-submit'),
    };
    let unitsReady = false;
    let captchaToken = '';
    let captchaWidgetId = null;
    let operationId = createOperationId();
    let operationFingerprint = '';

    function createOperationId() {
        if (root.crypto?.randomUUID) return root.crypto.randomUUID().replaceAll('-', '_');
        const bytes = new Uint8Array(16);
        root.crypto?.getRandomValues?.(bytes);
        return `public_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
    }

    function apiUrl() {
        return root.location.protocol === 'file:' ? `http://localhost:3000${API_PATH}` : `${root.location.origin}${API_PATH}`;
    }

    async function signRequestToken(message, timestamp) {
        const encoder = new TextEncoder();
        const digest = await root.crypto.subtle.digest('SHA-256', encoder.encode(message));
        const messageDigest = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
        const host = root.location.hostname || 'localhost';
        const userAgent = navigator.userAgent || '';
        const signData = `${timestamp}:${host}:${userAgent.length}:${messageDigest}`;
        const keyMaterial = `xnc-phu-tho:${host}:${userAgent.substring(0, 16)}`;
        const key = await root.crypto.subtle.importKey('raw', encoder.encode(keyMaterial), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const signature = await root.crypto.subtle.sign('HMAC', key, encoder.encode(signData));
        return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
    }

    function setStatus(message, tone = '') {
        elements.status.textContent = message || '';
        if (tone) elements.status.dataset.tone = tone;
        else delete elements.status.dataset.tone;
    }

    function refreshSubmitState() {
        elements.submit.disabled = !unitsReady || !captchaToken || !form.checkValidity();
    }

    function renderCaptcha() {
        if (!root.turnstile || !elements.captcha || captchaWidgetId !== null) return;
        captchaWidgetId = root.turnstile.render(elements.captcha, {
            sitekey: elements.captcha.dataset.sitekey,
            callback: token => { captchaToken = token; refreshSubmitState(); },
            'expired-callback': () => { captchaToken = ''; refreshSubmitState(); },
            'error-callback': () => { captchaToken = ''; setStatus('Không tải được xác minh bảo mật. Vui lòng thử lại.', 'error'); refreshSubmitState(); },
        });
    }
    root.onPublicTurnstileLoad = renderCaptcha;

    async function loadUnits() {
        try {
            const response = await fetch(apiUrl(), { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error('UNITS_UNAVAILABLE');
            const payload = await response.json();
            const units = Array.isArray(payload?.data?.units) ? payload.data.units : [];
            elements.unit.replaceChildren(new Option('Chọn đơn vị quản lý', ''));
            units.forEach(unit => elements.unit.add(new Option(unit.label, unit.unitCode)));
            elements.unit.disabled = units.length === 0;
            unitsReady = units.length > 0;
            if (!unitsReady) setStatus('Chưa tải được danh sách đơn vị. Vui lòng thử lại sau.', 'error');
            refreshSubmitState();
        } catch (_) {
            elements.unit.disabled = true;
            setStatus('Chưa tải được danh sách đơn vị. Vui lòng thử lại sau.', 'error');
        }
    }

    function inputValue(element) { return String(element.value || '').trim(); }

    function fingerprint(file) {
        return JSON.stringify({
            unit: inputValue(elements.unit), name: inputValue(elements.name), address: inputValue(elements.address), maps: inputValue(elements.maps),
            publicPhone: inputValue(elements.publicPhone), submitterName: inputValue(elements.submitterName), submitterPhone: inputValue(elements.submitterPhone),
            note: inputValue(elements.note), file: file ? [file.name, file.size, file.lastModified, file.type] : [],
        });
    }

    function errorMessage(code) {
        const messages = {
            UNIT_NOT_ALLOWED: 'Đơn vị này không còn nhận đóng góp. Vui lòng tải lại trang.',
            COORDINATE_INVALID_LINK: 'Link Google Maps không hợp lệ.',
            COORDINATE_OUTSIDE_PHU_THO: 'Địa điểm trong link Google Maps nằm ngoài phạm vi Phú Thọ.',
            COORDINATE_NEEDS_REVIEW: 'Chưa xác định được tọa độ từ link Google Maps. Vui lòng dùng link đầy đủ.',
            CAPTCHA_FAILED: 'Xác minh CAPTCHA thất bại. Vui lòng thử lại.',
            RATE_LIMIT_EXCEEDED: 'Bạn đã gửi quá số lần cho phép hôm nay. Vui lòng thử lại vào ngày mai.',
            IMAGE_TOO_LARGE: 'Ảnh quá lớn. Vui lòng chọn ảnh khác.',
            IMAGE_TYPE_NOT_ALLOWED: 'Ảnh phải là JPEG, PNG hoặc WebP.',
        };
        return messages[code] || 'Chưa gửi được đóng góp. Bạn có thể kiểm tra lại và thử lại.';
    }

    async function prepareImage(file) {
        if (!file) throw new Error('IMAGE_REQUIRED');
        if (!root.StaffImage?.prepareImage) throw new Error('IMAGE_COMPRESSION_UNAVAILABLE');
        return root.StaffImage.prepareImage(file);
    }

    async function submit(event) {
        event.preventDefault();
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const file = elements.image.files?.[0];
        const nextFingerprint = fingerprint(file);
        if (nextFingerprint !== operationFingerprint) { operationId = createOperationId(); operationFingerprint = nextFingerprint; }
        elements.submit.disabled = true;
        elements.submit.setAttribute('aria-busy', 'true');
        setStatus('Đang gửi đóng góp…');
        try {
            const image = await prepareImage(file);
            const body = {
                operationId, requestType: 'Thêm địa điểm mới', unitCode: inputValue(elements.unit), locationName: inputValue(elements.name),
                address: inputValue(elements.address), mapsUrl: inputValue(elements.maps), publicPhone: inputValue(elements.publicPhone),
                submitterName: inputValue(elements.submitterName), submitterPhone: inputValue(elements.submitterPhone), note: inputValue(elements.note),
                image, captchaToken,
            };
            const timestamp = Date.now().toString();
            const token = await signRequestToken(operationId, timestamp);
            const response = await fetch(apiUrl(), {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Request-Token': token, 'X-Request-Time': timestamp }, body: JSON.stringify(body),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'SUBMISSION_FAILED');
            setStatus('Đã tiếp nhận đóng góp. Thông tin sẽ chỉ hiển thị trên bản đồ sau khi được kiểm tra và phê duyệt.', 'success');
            form.reset();
            operationId = createOperationId();
            operationFingerprint = '';
            captchaToken = '';
            if (root.turnstile && captchaWidgetId !== null) root.turnstile.reset(captchaWidgetId);
        } catch (error) {
            setStatus(errorMessage(error.message), 'error');
        } finally {
            elements.submit.removeAttribute('aria-busy');
            refreshSubmitState();
        }
    }

    form.addEventListener('input', refreshSubmitState);
    form.addEventListener('change', refreshSubmitState);
    form.addEventListener('submit', submit);
    loadUnits();
    if (root.turnstile) renderCaptcha();
})(window);
