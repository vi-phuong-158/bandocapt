(function (root) {
    'use strict';

    const API_PATH = '/api/location-contributions';
    const taxonomy = root.LocationTaxonomy;
    const form = document.getElementById('public-contribution-form');
    if (!form || !taxonomy) return;
    const elements = {
        unit: document.getElementById('unit-code'), name: document.getElementById('location-name'), address: document.getElementById('address'),
        maps: document.getElementById('maps-url'), image: document.getElementById('location-image'), publicPhone: document.getElementById('public-phone'),
        submitterName: document.getElementById('submitter-name'), submitterPhone: document.getElementById('submitter-phone'), note: document.getElementById('note'),
        requestType: document.getElementById('request-type'), target: document.getElementById('target-record-id'), targetField: document.getElementById('target-location-field'),
        siteType: document.getElementById('site-type'), services: document.getElementById('services-field'), locationFields: document.getElementById('location-fields'),
        serviceSchedule: document.getElementById('service-schedule'), servedUnits: document.getElementById('served-units'), imageField: document.getElementById('location-image-field'),
        captcha: document.getElementById('public-turnstile-widget'), status: document.getElementById('public-contribution-status'), submit: document.getElementById('public-contribution-submit'),
    };
    let units = [];
    let targets = [];
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
        const kind = taxonomy.requestKind(elements.requestType.value);
        const selectedServices = Array.from(elements.services.querySelectorAll('input:checked'));
        elements.submit.disabled = !unitsReady || !captchaToken || !form.checkValidity() ||
            (kind !== 'CREATE' && !elements.target.value) || (kind === 'CREATE' && !selectedServices.length);
    }

    function renderTaxonomy() {
        elements.siteType.replaceChildren(new Option('Chọn loại địa điểm', ''));
        taxonomy.SITE_TYPES.forEach(item => elements.siteType.add(new Option(item.label, item.code)));
        elements.services.replaceChildren();
        taxonomy.SERVICES.forEach(item => {
            const label = document.createElement('label');
            label.className = 'public-contribution-service';
            const input = document.createElement('input');
            input.type = 'checkbox'; input.name = 'services'; input.value = item.code;
            const text = document.createElement('span'); text.textContent = item.label;
            label.append(input, text); elements.services.appendChild(label);
        });
    }

    function updateRequestMode() {
        const kind = taxonomy.requestKind(elements.requestType.value);
        const isCreate = kind === 'CREATE';
        const stop = kind === 'STOP';
        elements.targetField.hidden = isCreate;
        elements.target.disabled = isCreate || !elements.unit.value || !targets.length;
        elements.locationFields.hidden = stop;
        elements.siteType.required = isCreate;
        elements.address.required = isCreate;
        elements.maps.required = isCreate;
        elements.image.required = isCreate;
        elements.imageField.hidden = stop;
        refreshSubmitState();
    }

    function prefillTarget() {
        const target = targets.find(item => item.recordId === elements.target.value);
        if (!target) return;
        elements.siteType.value = taxonomy.isWritableSiteType(target.siteType) ? target.siteType : '';
        const services = taxonomy.toCanonicalServices(target.services) || [];
        elements.services.querySelectorAll('input').forEach(input => { input.checked = services.includes(input.value); });
        elements.name.value = target.name || '';
        elements.address.value = target.address || '';
        elements.maps.value = target.googleMapsUrl || '';
        elements.publicPhone.value = target.phone || '';
        elements.serviceSchedule.value = target.serviceSchedule || '';
        elements.servedUnits.value = target.servedUnits || '';
        refreshSubmitState();
    }

    async function loadTargets() {
        targets = [];
        elements.target.replaceChildren(new Option(elements.unit.value ? 'Đang tải địa điểm…' : 'Chọn đơn vị trước', ''));
        if (!elements.unit.value) return updateRequestMode();
        try {
            const response = await fetch(`${apiUrl()}?unitCode=${encodeURIComponent(elements.unit.value)}`, { headers: { Accept: 'application/json' } });
            const payload = await response.json();
            if (!response.ok) throw new Error('TARGETS_UNAVAILABLE');
            targets = Array.isArray(payload?.data?.locations) ? payload.data.locations : [];
            elements.target.replaceChildren(new Option(targets.length ? 'Chọn địa điểm' : 'Chưa có địa điểm công khai', ''));
            targets.forEach(target => elements.target.add(new Option(`${taxonomy.displaySiteType(target.siteType)} — ${target.address || target.name}`, target.recordId)));
        } catch (_) { setStatus('Chưa tải được địa điểm hiện có. Vui lòng thử lại sau.', 'error'); }
        updateRequestMode();
    }

    function renderCaptcha() {
        if (!root.turnstile || !elements.captcha || captchaWidgetId !== null || !elements.captcha.dataset.sitekey) return;
        captchaWidgetId = root.turnstile.render(elements.captcha, {
            sitekey: elements.captcha.dataset.sitekey,
            callback: token => { captchaToken = token; refreshSubmitState(); },
            'expired-callback': () => { captchaToken = ''; refreshSubmitState(); },
            'error-callback': () => { captchaToken = ''; setStatus('Không tải được xác minh bảo mật. Vui lòng thử lại.', 'error'); refreshSubmitState(); },
        });
    }
    root.onPublicTurnstileLoad = renderCaptcha;

    async function loadPublicConfig() {
        try {
            const response = await fetch(`${apiUrl()}?config=public`, { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error('PUBLIC_CONFIG_UNAVAILABLE');
            const payload = await response.json();
            const sitekey = typeof payload?.data?.turnstileSiteKey === 'string' ? payload.data.turnstileSiteKey.trim() : '';
            if (!sitekey || sitekey.length > 200) throw new Error('PUBLIC_CONFIG_INVALID');
            elements.captcha.dataset.sitekey = sitekey;
            renderCaptcha();
        } catch (_) {
            setStatus('Không tải được cấu hình xác minh bảo mật. Vui lòng thử lại sau.', 'error');
        }
    }

    async function loadUnits() {
        try {
            const response = await fetch(apiUrl(), { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error('UNITS_UNAVAILABLE');
            const payload = await response.json();
            units = Array.isArray(payload?.data?.units) ? payload.data.units : [];
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
            unit: inputValue(elements.unit), requestType: inputValue(elements.requestType), target: inputValue(elements.target), siteType: inputValue(elements.siteType),
            services: Array.from(elements.services.querySelectorAll('input:checked')).map(input => input.value), name: inputValue(elements.name), address: inputValue(elements.address), maps: inputValue(elements.maps),
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
            NO_CHANGES: 'Bạn chưa thay đổi thông tin nào của địa điểm.',
            SERVICES_MISSING: 'Vui lòng chọn ít nhất một dịch vụ.',
            ADDRESS_MISSING: 'Vui lòng nhập địa chỉ.',
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
        const requestKind = taxonomy.requestKind(elements.requestType.value);
        const selectedServices = Array.from(elements.services.querySelectorAll('input:checked')).map(input => input.value);
        if (requestKind !== 'STOP' && !selectedServices.length) { setStatus('Vui lòng chọn ít nhất một dịch vụ.', 'error'); return; }
        const file = elements.image.files?.[0];
        const nextFingerprint = fingerprint(file);
        if (nextFingerprint !== operationFingerprint) { operationId = createOperationId(); operationFingerprint = nextFingerprint; }
        elements.submit.disabled = true;
        elements.submit.setAttribute('aria-busy', 'true');
        setStatus('Đang gửi đóng góp…');
        try {
            const body = {
                operationId, requestType: inputValue(elements.requestType), unitCode: inputValue(elements.unit), targetRecordId: inputValue(elements.target),
                siteType: inputValue(elements.siteType), services: selectedServices, locationName: inputValue(elements.name),
                address: inputValue(elements.address), mapsUrl: inputValue(elements.maps), publicPhone: inputValue(elements.publicPhone),
                serviceSchedule: inputValue(elements.serviceSchedule), servedUnits: inputValue(elements.servedUnits),
                submitterName: inputValue(elements.submitterName), submitterPhone: inputValue(elements.submitterPhone), note: inputValue(elements.note),
                captchaToken,
            };
            if (requestKind !== 'STOP' && file) body.image = await prepareImage(file);
            const timestamp = Date.now().toString();
            const token = await signRequestToken(operationId, timestamp);
            const response = await fetch(apiUrl(), {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Request-Token': token, 'X-Request-Time': timestamp }, body: JSON.stringify(body),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'SUBMISSION_FAILED');
            setStatus('Đã tiếp nhận yêu cầu. Thông tin chỉ thay đổi trên bản đồ sau khi được kiểm tra và phê duyệt.', 'success');
            form.reset();
            renderTaxonomy();
            targets = [];
            updateRequestMode();
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
    elements.unit.addEventListener('change', loadTargets);
    elements.requestType.addEventListener('change', updateRequestMode);
    elements.target.addEventListener('change', prefillTarget);
    form.addEventListener('submit', submit);
    renderTaxonomy();
    updateRequestMode();
    loadPublicConfig();
    loadUnits();
    if (root.turnstile) renderCaptcha();
})(window);
