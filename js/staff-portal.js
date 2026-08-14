(function (root) {
    'use strict';

    const api = root.StaffApiClient.createClient();
    const portal = document.getElementById('staff-portal');
    const state = {
        status: 'BOOTING',
        user: null,
        units: [],
        selectedUnitCode: '',
        locations: [],
        notice: null,
        modal: null,
        config: null,
        busy: false,
    };

    const STATUS_TEXT = {
        APPROVED: 'Đang hiển thị',
        ACTIVE: 'Đang hoạt động',
        TEMPORARILY_PAUSED: 'Tạm dừng hiển thị',
        STOPPED: 'Đã ngừng hoạt động',
    };
    const SITE_TYPES = [
        ['HEADQUARTERS', 'Trụ sở Công an'],
        ['SECONDARY_OFFICE', 'Điểm làm việc / Trụ sở phụ'],
        ['CITIZEN_ID_POINT', 'Điểm cấp căn cước'],
        ['MOBILE_POINT', 'Điểm lưu động'],
        ['PUBLIC_SERVICE_CENTER', 'Điểm tiếp nhận thủ tục hành chính'],
        ['OTHER', 'Khác'],
    ];
    const SERVICE_OPTIONS = [
        ['POLICE_OFFICE', 'Trụ sở Công an'],
        ['CITIZEN_ID', 'Cấp căn cước'],
        ['E_IDENTIFICATION', 'Hỗ trợ VNeID / định danh điện tử'],
        ['RESIDENCE', 'Cư trú'],
        ['VEHICLE_REGISTRATION', 'Đăng ký xe'],
        ['DUTY', 'Trực ban'],
        ['CRIME_REPORT', 'Tiếp nhận tin báo, tố giác tội phạm'],
        ['OTHER', 'Khác'],
    ];
    const CCCD_MODES = [
        ['', 'Chưa xác định'],
        ['NOT_PROVIDED', 'Không tiếp nhận căn cước'],
        ['PERMANENT', 'Tiếp nhận thường xuyên'],
        ['SCHEDULED', 'Tiếp nhận theo lịch'],
        ['CAMPAIGN', 'Tiếp nhận theo đợt cao điểm'],
        ['MOBILE', 'Tiếp nhận lưu động'],
        ['TEMPORARILY_PAUSED', 'Tạm dừng tiếp nhận'],
    ];

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function append(parent, ...children) { children.filter(Boolean).forEach(child => parent.appendChild(child)); return parent; }
    function button(label, className, handler) {
        const node = el('button', `staff-button ${className || ''}`, label);
        node.type = 'button';
        if (handler) node.addEventListener('click', handler);
        return node;
    }
    function recordValue(record, snake, camel, fallback = '') { return record?.[snake] ?? record?.[camel] ?? fallback; }
    function displayStatus(value) { return STATUS_TEXT[value] || (value ? String(value) : 'Chưa có trạng thái'); }
    function displayServices(value) { return Array.isArray(value) ? value.join(', ') : String(value || ''); }
    function clearPortal() { while (portal.firstChild) portal.removeChild(portal.firstChild); }

    function notice(message, tone = 'warning') { state.notice = { message, tone }; }
    function errorMessage(error) {
        const code = error?.code || '';
        const messages = {
            STAFF_NOT_AUTHORIZED: 'Tài khoản này chưa được cấp quyền truy cập cổng cập nhật.',
            STAFF_ACCESS_REVOKED: 'Tài khoản này hiện không còn được quyền cập nhật dữ liệu.',
            STAFF_SESSION_INVALID: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.',
            GOOGLE_TOKEN_INVALID: 'Không thể xác minh tài khoản Google. Vui lòng thử lại.',
            STAFF_AUTH_CONFIG_INVALID: 'Cổng đăng nhập hiện chưa sẵn sàng. Vui lòng liên hệ quản trị hệ thống.',
            STAFF_GATEWAY_UNAVAILABLE: 'Hệ thống tạm thời chưa kết nối được dữ liệu. Vui lòng thử lại.',
            STAFF_GATEWAY_REJECTED: 'Yêu cầu chưa thể xử lý. Vui lòng thử lại sau.',
            STAFF_PUBLIC_SOURCE_UNAVAILABLE: 'Hệ thống tạm thời chưa kết nối được dữ liệu. Vui lòng thử lại.',
            STAFF_OPERATIONAL_BASELINE_NOT_READY: 'Dữ liệu nền của địa điểm này chưa sẵn sàng để cập nhật. Vui lòng liên hệ quản trị hệ thống.',
            STAFF_REQUEST_INVALID: 'Một hoặc nhiều trường nhập chưa đúng định dạng hoặc quá dài.',
            TARGET_RECORD_UNIT_MISMATCH: 'Bạn không có quyền cập nhật địa điểm này.',
            TARGET_RECORD_ID_NOT_FOUND: 'Không tìm thấy địa điểm cần cập nhật.',
            STALE_PUBLIC_SNAPSHOT: 'Thông tin địa điểm đã thay đổi. Dữ liệu mới đã được tải lại, vui lòng kiểm tra trước khi gửi.',
            IMAGE_REQUIRED: 'Vui lòng chọn ảnh địa điểm trước khi gửi yêu cầu.',
            STAFF_IMAGE_TOO_LARGE: 'Ảnh vẫn còn quá lớn. Vui lòng chọn ảnh khác.',
            IMAGE_TYPE_NOT_ALLOWED: 'Vui lòng chọn ảnh JPG, PNG hoặc WebP.',
            IMAGE_COMPRESSION_UNAVAILABLE: 'Không thể xử lý ảnh trên thiết bị này.',
            SERVICES_MISSING: 'Vui lòng chọn ít nhất một dịch vụ.',
            ADDRESS_MISSING: 'Vui lòng nhập địa chỉ địa điểm.',
            LOCATION_NAME_MISSING: 'Vui lòng nhập tên địa điểm.',
            COORDINATE_NEEDS_REVIEW: 'Vui lòng nhập tọa độ hợp lệ theo dạng vĩ độ, kinh độ.',
            COORDINATE_INVALID_LINK: 'Liên kết Google Maps chưa hợp lệ. Vui lòng kiểm tra lại.',
            COORDINATE_OUTSIDE_PHU_THO: 'Tọa độ nằm ngoài khu vực Phú Thọ được hỗ trợ.',
        };
        return messages[code] || 'Đã có lỗi xảy ra. Vui lòng thử lại.';
    }

    function isSessionError(error) { return ['STAFF_SESSION_INVALID', 'STAFF_ACCESS_REVOKED'].includes(error?.code) || error?.status === 401; }
    function isRevoked(error) { return error?.code === 'STAFF_ACCESS_REVOKED'; }

    function renderLoading(message = 'Đang tải…') {
        clearPortal();
        const shell = el('div', 'staff-loading staff-portal-shell');
        append(shell, el('p', '', message));
        portal.appendChild(shell);
    }

    function renderSignedOut() {
        clearPortal();
        const shell = el('div', 'staff-auth-shell');
        const card = el('section', 'staff-auth-card');
        const logo = el('img', 'staff-logo');
        logo.src = '/assets/icon-bando.png';
        logo.alt = 'Bản đồ Công an số tỉnh Phú Thọ';
        const buttonTarget = el('div', 'staff-google-button');
        buttonTarget.id = 'google-button';
        append(card, logo,
            el('p', 'staff-eyebrow', 'Cổng cập nhật địa điểm'),
            el('h1', 'staff-title', 'Bản đồ Công an số tỉnh Phú Thọ'),
            el('p', 'staff-subtitle', 'Dành cho cán bộ được phân quyền cập nhật, xác minh thông tin địa điểm.'),
            buttonTarget,
            el('p', 'staff-auth-note', 'Thông tin chỉ được ghi nhận sau khi đăng nhập và vẫn phải qua quy trình duyệt.'));
        append(shell, card);
        portal.appendChild(shell);
        if (!state.config) {
            api.getConfig().then(config => {
                state.config = config;
                renderSignedOut();
            }).catch(error => {
                buttonTarget.replaceChildren(el('p', 'staff-notice staff-notice-warning', errorMessage(error)));
            });
            return;
        }
        const rendered = root.StaffGoogleSignIn.render({
            clientId: state.config.googleClientId,
            element: buttonTarget,
            onCredential: handleCredential,
            onError: error => { buttonTarget.appendChild(el('p', 'staff-notice staff-notice-warning', errorMessage(error))); },
        });
        if (!rendered) buttonTarget.appendChild(el('p', 'staff-notice staff-notice-warning', 'Không thể tải nút đăng nhập Google. Vui lòng tải lại trang.'));
    }

    function renderDenied() {
        clearPortal();
        const shell = el('div', 'staff-auth-shell');
        const card = el('section', 'staff-auth-card');
        append(card, el('h1', 'staff-title', 'Không có quyền truy cập'), el('p', 'staff-subtitle', 'Tài khoản này hiện không còn được quyền cập nhật dữ liệu.'), button('Đăng nhập lại', 'staff-button-primary', () => { state.status = 'SIGNED_OUT'; state.user = null; renderSignedOut(); }));
        portal.appendChild(append(shell, card));
    }

    function renderAuthorized() {
        clearPortal();
        const shell = el('div', 'staff-portal-shell');
        const header = el('header', 'staff-topbar');
        const heading = el('div');
        append(heading, el('p', 'staff-eyebrow', 'Cổng cập nhật địa điểm'), el('h1', '', 'Địa điểm của đơn vị'), el('p', 'staff-user-meta', `Đã đăng nhập: ${state.user?.email || ''}`));
        const headerActions = el('div', 'staff-actions');
        append(headerActions, button('Đăng xuất', 'staff-button', handleLogout));
        append(header, heading, headerActions);
        shell.appendChild(header);
        if (state.notice) {
            const noticeNode = el('div', `staff-notice staff-notice-${state.notice.tone}`, state.notice.message);
            shell.appendChild(noticeNode);
        }
        if (state.units.length > 1) {
            const unitBar = el('section', 'staff-unit-bar');
            const label = el('label', '', 'Đơn vị đang chọn');
            const select = document.createElement('select');
            select.name = 'selectedUnitCode';
            select.setAttribute('aria-label', 'Đơn vị đang chọn');
            state.units.forEach(unit => { const option = el('option', '', unit.unitName); option.value = unit.unitCode; option.selected = unit.unitCode === state.selectedUnitCode; select.appendChild(option); });
            select.addEventListener('change', event => { state.selectedUnitCode = event.target.value; renderAuthorized(); });
            append(unitBar, label, select);
            shell.appendChild(unitBar);
        }
        const headingRow = el('div', 'staff-section-heading');
        append(headingRow, el('h2', '', 'Địa điểm của đơn vị'), button('+ Thêm địa điểm mới', 'staff-button-primary', () => openModal('create')));
        shell.appendChild(headingRow);
        const selectedLocations = state.locations.filter(item => !state.selectedUnitCode || recordValue(item.record, 'unit_code', 'unitCode') === state.selectedUnitCode);
        if (!selectedLocations.length) {
            const empty = el('section', 'staff-state-card');
            append(empty, el('h2', '', 'Đơn vị chưa có địa điểm đang hiển thị.'), button('Thêm địa điểm mới', 'staff-button-primary', () => openModal('create')));
            shell.appendChild(empty);
        } else {
            const list = el('div', 'staff-location-list');
            selectedLocations.forEach(item => list.appendChild(renderLocationCard(item)));
            shell.appendChild(list);
        }
        portal.appendChild(shell);
        if (state.modal) renderModal();
    }

    function renderLocationCard(item) {
        const record = item.record || {};
        const card = el('article', 'staff-location-card');
        const title = el('h3', '', recordValue(record, 'name', 'name', 'Địa điểm chưa có tên'));
        const dl = el('dl');
        const rows = [
            ['Địa chỉ', recordValue(record, 'address', 'address')],
            ['Số điện thoại', recordValue(record, 'phone', 'phone')],
            ['Dịch vụ', displayServices(recordValue(record, 'services', 'services'))],
        ];
        rows.forEach(([label, value]) => { if (value) append(dl, el('dt', '', label), el('dd', '', value)); });
        const status = el('span', 'staff-status', displayStatus(recordValue(record, 'status', 'status')));
        const actions = el('div', 'staff-card-actions');
        append(actions,
            button('Xác nhận thông tin đúng', 'staff-button-soft', () => openModal('confirm', item)),
            button('Cập nhật thông tin', 'staff-button', () => openModal('update', item)),
            button('Báo địa chỉ/vị trí sai', 'staff-button', () => openModal('correct', item)),
            button('Báo ngừng hoạt động', 'staff-button-danger', () => openModal('stop', item)));
        append(card, title, dl, status, actions);
        return card;
    }

    function field(form, name, label, value = '', type = 'text', required = false, help = '') {
        const wrap = el('div', 'staff-field');
        const labelNode = el('label', '', label);
        labelNode.htmlFor = `staff-${name}`;
        const input = type === 'textarea' ? document.createElement('textarea') : document.createElement(type === 'select' ? 'select' : 'input');
        input.id = `staff-${name}`;
        input.name = name;
        if (type !== 'textarea' && type !== 'select') input.type = type;
        input.value = Array.isArray(value) ? value.join(', ') : String(value || '');
        input.required = required;
        append(wrap, labelNode, input);
        if (help) wrap.appendChild(el('small', '', help));
        form.appendChild(wrap);
    }

    function selectField(form, name, label, value, options, required = false) {
        const wrap = el('div', 'staff-field');
        const labelNode = el('label', '', label);
        labelNode.htmlFor = `staff-${name}`;
        const select = document.createElement('select');
        select.id = `staff-${name}`;
        select.name = name;
        select.required = required;
        options.forEach(([optionValue, optionLabel]) => {
            const option = el('option', '', optionLabel);
            option.value = optionValue;
            option.selected = optionValue === String(value || '');
            select.appendChild(option);
        });
        append(wrap, labelNode, select);
        form.appendChild(wrap);
    }

    function servicesField(form, value, required = false) {
        const wrap = el('div', 'staff-field');
        const selected = new Set(Array.isArray(value) ? value : String(value || '').split(',').map(item => item.trim()).filter(Boolean));
        append(wrap, el('span', '', `Dịch vụ${required ? ' (bắt buộc)' : ''}`), el('small', '', 'Chọn một hoặc nhiều dịch vụ đang được tiếp nhận.'));
        const grid = el('div', 'staff-checkbox-grid');
        if (required) grid.setAttribute('aria-required', 'true');
        SERVICE_OPTIONS.forEach(([optionValue, optionLabel]) => {
            const label = el('label', 'staff-checkbox');
            const input = document.createElement('input');
            input.type = 'checkbox'; input.name = 'services'; input.value = optionValue; input.checked = selected.has(optionValue);
            append(label, input, el('span', '', optionLabel));
            grid.appendChild(label);
        });
        wrap.appendChild(grid);
        form.appendChild(wrap);
    }

    function formValues(form) {
        const values = {};
        Array.from(form.elements).forEach(input => {
            if (!input.name) return;
            if (input.type === 'checkbox') {
                if (!Array.isArray(values[input.name])) values[input.name] = [];
                if (input.checked) values[input.name].push(input.value);
                return;
            }
            values[input.name] = input.value;
        });
        if (!Array.isArray(values.services)) values.services = values.services ? String(values.services).split(',').map(item => item.trim()).filter(Boolean) : [];
        return values;
    }

    function openModal(mode, item = null) { state.modal = { mode, item, error: null }; renderAuthorized(); }
    function closeModal() { if (!state.busy) { state.modal = null; renderAuthorized(); } }

    function renderModal() {
        const modal = state.modal;
        const requiresLocationFields = ['create', 'update', 'correct'].includes(modal.mode);
        const saved = modal.values || null;
        function kept(name, fallback) { return saved && Object.prototype.hasOwnProperty.call(saved, name) ? saved[name] : fallback; }
        const backdrop = el('div', 'staff-modal-backdrop');
        backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(); });
        const card = el('section', 'staff-modal-card');
        const header = el('div', 'staff-modal-header');
        const title = { create: 'Thêm địa điểm mới', update: 'Cập nhật thông tin', correct: 'Báo địa chỉ/vị trí sai', stop: 'Báo ngừng hoạt động', confirm: 'Xác nhận thông tin' }[modal.mode];
        append(header, el('h2', '', title), button('Đóng', 'staff-button', closeModal));
        card.appendChild(header);
        if (modal.error) {
            const errorNotice = el('div', 'staff-notice staff-notice-warning', modal.error);
            if (saved && requiresLocationFields) {
                errorNotice.appendChild(el('small', '', ' Các thông tin đã nhập được giữ lại; vui lòng chọn lại ảnh nếu cần gửi lại.'));
            }
            card.appendChild(errorNotice);
        }
        const form = document.createElement('form');
        form.className = 'staff-form';
        if (modal.mode === 'confirm') {
            append(form, el('p', '', 'Bạn xác nhận thông tin địa điểm này hiện vẫn chính xác?'));
            field(form, 'note', 'Ghi chú (không bắt buộc)', kept('note', ''), 'textarea');
        } else if (modal.mode === 'stop') {
            append(form, el('p', '', 'Bạn muốn báo địa điểm này đã ngừng hoạt động?'));
            field(form, 'reviewNote', 'Lý do hoặc ghi chú (không bắt buộc)', kept('reviewNote', ''), 'textarea');
        } else {
            const record = modal.item?.record || {};
            const source = {
                locationName: kept('locationName', recordValue(record, 'name', 'name')),
                siteType: kept('siteType', recordValue(record, 'site_type', 'siteType')),
                services: kept('services', recordValue(record, 'services', 'services')),
                address: kept('address', recordValue(record, 'address', 'address')),
                publicPhone: kept('publicPhone', recordValue(record, 'phone', 'phone')),
                mapsUrl: kept('mapsUrl', recordValue(record, 'google_maps_url', 'googleMapsUrl')),
                coordinates: kept('coordinates', recordValue(record, 'coordinates', 'coordinates')),
                cccdServiceMode: kept('cccdServiceMode', recordValue(record, 'cccd_service_mode', 'cccdServiceMode')),
                serviceSchedule: kept('serviceSchedule', recordValue(record, 'service_schedule', 'serviceSchedule')),
                servedUnits: kept('servedUnits', recordValue(record, 'served_units', 'servedUnits')),
                searchAliases: kept('searchAliases', recordValue(record, 'search_aliases', 'searchAliases')),
            };
            field(form, 'locationName', 'Tên địa điểm', source.locationName, 'text', true);
            field(form, 'address', 'Địa chỉ', source.address, 'text', true);
            field(form, 'publicPhone', 'Số điện thoại', source.publicPhone, 'tel');
            servicesField(form, source.services, requiresLocationFields);
            selectField(form, 'siteType', 'Loại địa điểm', source.siteType, SITE_TYPES, true);
            field(form, 'mapsUrl', 'Maps URL', source.mapsUrl, 'url');
            field(form, 'coordinates', 'Tọa độ (bắt buộc)', source.coordinates, 'text', requiresLocationFields, 'Nhập theo dạng vĩ độ, kinh độ. Ví dụ: 21.3225,105.4027');
            selectField(form, 'cccdServiceMode', 'Hình thức dịch vụ căn cước', source.cccdServiceMode, CCCD_MODES);
            field(form, 'serviceSchedule', 'Lịch phục vụ', source.serviceSchedule, 'textarea');
            field(form, 'servedUnits', 'Đơn vị phục vụ', source.servedUnits);
            field(form, 'searchAliases', 'Tên gọi khác', source.searchAliases);
            if (modal.mode === 'create') {
                field(form, 'submitterName', 'Họ tên cán bộ', kept('submitterName', ''), 'text', true);
                field(form, 'submitterPhone', 'Số điện thoại liên hệ', kept('submitterPhone', ''), 'tel');
            }
            field(form, 'reviewNote', 'Ghi chú gửi duyệt', kept('reviewNote', ''), 'textarea');
            const image = document.createElement('div');
            image.className = 'staff-field';
            const imageLabel = el('label', '', `Ảnh địa điểm${requiresLocationFields ? ' (bắt buộc)' : ''}`);
            const imageInput = document.createElement('input');
            imageInput.type = 'file'; imageInput.name = 'image'; imageInput.accept = 'image/jpeg,image/png,image/webp'; imageInput.capture = 'environment'; imageInput.id = 'staff-image';
            imageInput.required = requiresLocationFields;
            append(image, imageLabel, imageInput, el('small', '', 'Ảnh sẽ được nén trên thiết bị trước khi gửi.'));
            form.appendChild(image);
        }
        const actions = el('div', 'staff-modal-actions');
        const primaryAction = button(modal.mode === 'confirm' ? 'Xác nhận' : 'Gửi yêu cầu', 'staff-button-primary', null);
        primaryAction.type = 'submit';
        append(actions, button('Hủy', 'staff-button', closeModal), primaryAction);
        form.appendChild(actions);
        form.addEventListener('submit', event => { event.preventDefault(); submitModal(form); });
        card.appendChild(form);
        backdrop.appendChild(card);
        portal.appendChild(backdrop);
        form.querySelector('button.staff-button-primary').focus();
    }

    async function submitModal(form) {
        if (state.busy) return;
        state.busy = true;
        state.status = 'MUTATING';
        const values = formValues(form);
        try {
            const requiresLocationFields = ['create', 'update', 'correct'].includes(state.modal.mode);
            if (requiresLocationFields && !values.services.length) throw new Error('SERVICES_MISSING');
            let image = null;
            const file = form.elements.image?.files?.[0];
            if (requiresLocationFields && !file) throw new Error('IMAGE_REQUIRED');
            if (file) image = await root.StaffImage.prepareImage(file);
            if (state.modal.mode === 'confirm') {
                await api.verify(root.StaffApiClient.buildVerificationPayload(values.note, { record_id: state.modal.item.record.record_id, snapshotHash: state.modal.item.snapshotHash }));
                notice('Đã ghi nhận xác nhận thông tin.', 'success');
            } else if (state.modal.mode === 'stop') {
                await api.submitRequest(root.StaffApiClient.buildStopPayload(values.reviewNote, { record_id: state.modal.item.record.record_id, snapshotHash: state.modal.item.snapshotHash }));
                notice('Yêu cầu đã được gửi và đang chờ duyệt.', 'success');
            } else if (state.modal.mode === 'create') {
                values.image = image;
                await api.submitRequest(root.StaffApiClient.buildCreatePayload(values, state.selectedUnitCode));
                notice('Yêu cầu đã được gửi và đang chờ duyệt.', 'success');
            } else {
                values.image = image;
                const type = state.modal.mode === 'correct' ? 'Báo địa chỉ hoặc vị trí sai' : 'Cập nhật địa điểm đang có';
                await api.submitRequest(root.StaffApiClient.buildTargetPayload(values, type, { record_id: state.modal.item.record.record_id, snapshotHash: state.modal.item.snapshotHash }));
                notice('Yêu cầu đã được gửi và đang chờ duyệt.', 'success');
            }
            state.modal = null;
            state.busy = false;
            renderAuthorized();
        } catch (error) {
            state.busy = false;
            if (isRevoked(error)) {
                state.locations = []; state.modal = null; state.status = 'NOT_AUTHORIZED'; renderDenied(); return;
            }
            if (error?.code === 'STALE_PUBLIC_SNAPSHOT') {
                state.modal = null; await loadLocations(); notice(errorMessage(error), 'warning'); renderAuthorized(); return;
            }
            const { image: _droppedImage, ...preservedValues } = values;
            state.modal.values = preservedValues;
            state.modal.error = errorMessage(error);
            renderAuthorized();
        }
    }

    async function loadLocations() {
        state.status = 'LOADING_LOCATIONS';
        renderLoading('Đang tải danh sách địa điểm…');
        try {
            const data = await api.getLocations();
            state.locations = Array.isArray(data.locations) ? data.locations : [];
            state.status = 'READY';
            renderAuthorized();
        } catch (error) {
            if (isSessionError(error)) { state.locations = []; state.status = isRevoked(error) ? 'NOT_AUTHORIZED' : 'SIGNED_OUT'; (state.status === 'NOT_AUTHORIZED' ? renderDenied : renderSignedOut)(); return; }
            state.status = 'ERROR';
            renderLoading();
            const card = el('section', 'staff-state-card');
            append(card, el('h2', '', 'Chưa tải được danh sách địa điểm.'), el('p', '', errorMessage(error)), button('Thử lại', 'staff-button-primary', loadLocations));
            portal.firstChild.replaceWith(append(el('div', 'staff-portal-shell'), card));
        }
    }

    async function handleCredential(credential) {
        state.status = 'AUTHENTICATING';
        renderLoading('Đang xác minh tài khoản…');
        try {
            const data = await api.signIn(credential);
            state.user = data.user;
            state.units = Array.isArray(data.units) ? data.units : [];
            state.selectedUnitCode = state.units[0]?.unitCode || '';
            state.status = 'AUTHORIZED';
            await loadLocations();
        } catch (error) {
            state.status = error?.code === 'STAFF_NOT_AUTHORIZED' || isRevoked(error) ? 'NOT_AUTHORIZED' : 'SIGNED_OUT';
            if (state.status === 'NOT_AUTHORIZED') renderDenied(); else { notice(errorMessage(error)); renderSignedOut(); }
        }
    }

    async function handleLogout() {
        if (state.busy) return;
        state.busy = true;
        try { await api.logout(); } catch (_) { /* local state is cleared even when the network is unavailable */ }
        state.busy = false; state.user = null; state.units = []; state.locations = []; state.modal = null; state.notice = null; state.status = 'SIGNED_OUT';
        try { await api.refreshCsrf(); } catch (_) { /* login will report a retryable error if CSRF cannot be refreshed */ }
        renderSignedOut();
    }

    async function bootstrap() {
        renderLoading();
        try {
            await api.getCsrf();
            const data = await api.getSession();
            state.user = data.user; state.units = Array.isArray(data.units) ? data.units : []; state.selectedUnitCode = state.units[0]?.unitCode || '';
            state.status = 'AUTHORIZED';
            await loadLocations();
        } catch (error) {
            if (isRevoked(error)) { state.status = 'NOT_AUTHORIZED'; renderDenied(); return; }
            if (error?.status === 401 || error?.code === 'STAFF_SESSION_INVALID') { state.status = 'SIGNED_OUT'; renderSignedOut(); return; }
            state.status = 'ERROR'; renderLoading(errorMessage(error));
        }
    }

    bootstrap();
})(typeof globalThis !== 'undefined' ? globalThis : window);
