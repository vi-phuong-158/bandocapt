'use strict';

const { createStaffApi } = require('../../../lib/staff-api');

const api = createStaffApi();

function isConfigRoute(req) {
    try {
        const url = new URL(String(req.url || ''), 'http://localhost');
        return url.searchParams.get('__staff_auth_route') === 'config';
    } catch {
        return false;
    }
}

module.exports = (req, res) => (isConfigRoute(req) ? api.config(req, res) : api.csrf(req, res));
