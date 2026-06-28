const {
    PUBLISHED_SHEET,
    fetchGoogleVisualizationPayload,
    parseGoogleVisualizationPayload,
} = require('../lib/published-locations');

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
        const payload = await fetchGoogleVisualizationPayload({ sheetId });
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
