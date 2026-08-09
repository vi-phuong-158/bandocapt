const {
    PUBLISHED_SHEET,
    fetchGoogleVisualizationPayload,
    parseGoogleVisualizationPayload,
} = require('../lib/published-locations');
const { normalizeLabel } = require('../js/location-data');

// Defense in depth: Published_Locations is the only allowed sheet, and only these
// labels may cross the public API even if an administrator later adds internal columns.
const PUBLIC_COLUMN_LABELS = new Set([
    'record_id', 'record id', 'ma ban ghi',
    'name', 'ten don vi', 'ten dia diem', 'ten tru so',
    'type', 'loai', 'loai don vi', 'loai dia diem',
    'address', 'dia chi', 'phone', 'so dien thoai', 'dien thoai',
    'coordinates', 'toa do', 'vi tri', 'google maps', 'link google maps',
    'image', 'image url', 'hinh anh', 'anh dai dien',
    'search_aliases', 'search aliases', 'alias tim kiem', 'aliases', 'alias',
    'updated_at', 'updated at', 'cap nhat luc', 'ngay cap nhat',
    'unit_code', 'site_type', 'services', 'google_maps_url', 'cccd_service_mode',
    'service_schedule', 'served_units', 'status', 'verified_at',
].map(normalizeLabel));

function filterPublicGoogleVisualizationPayload(payload) {
    const table = payload?.table;
    if (!table || !Array.isArray(table.cols) || !Array.isArray(table.rows)) {
        throw new Error('INVALID_SHEET_SCHEMA');
    }
    const indexes = table.cols.map((column, index) => ({
        column,
        index,
        label: normalizeLabel(column?.label || column?.id),
    })).filter(item => PUBLIC_COLUMN_LABELS.has(item.label));
    return {
        table: {
            ...table,
            cols: indexes.map(item => item.column),
            rows: table.rows.map(row => ({
                ...row,
                c: indexes.map(item => row?.c?.[item.index] || null),
            })),
        },
    };
}

async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    const requestedSheet = String(req.query?.sheet || PUBLISHED_SHEET);
    if (requestedSheet !== PUBLISHED_SHEET) {
        return res.status(400).json({ error: 'SHEET_NOT_ALLOWED' });
    }

    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) {
        console.error('[api/google-sheet] GOOGLE_SHEET_ID is not configured.');
        return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
    }

    try {
        const payload = filterPublicGoogleVisualizationPayload(await fetchGoogleVisualizationPayload({ sheetId }));
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        return res.status(200).json(payload);
    } catch (error) {
        const code = error?.name === 'AbortError' ? 'GOOGLE_TIMEOUT' : 'GOOGLE_UPSTREAM_ERROR';
        console.error(`[api/google-sheet] ${code}:`, error.message);
        return res.status(502).json({ error: code });
    }
}

module.exports = handler;
module.exports.parseGoogleVisualizationPayload = parseGoogleVisualizationPayload;
module.exports.filterPublicGoogleVisualizationPayload = filterPublicGoogleVisualizationPayload;
