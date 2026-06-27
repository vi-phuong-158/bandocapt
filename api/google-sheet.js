const PUBLISHED_SHEET = 'Published_Locations';
const GOOGLE_TIMEOUT_MS = 8000;

function parseGoogleVisualizationPayload(text) {
    const match = String(text || '').match(/google\.visualization\.Query\.setResponse\((.+)\);?\s*$/s);
    if (!match?.[1]) throw new Error('INVALID_GOOGLE_RESPONSE');

    const payload = JSON.parse(match[1]);
    if (!payload?.table || !Array.isArray(payload.table.cols) || !Array.isArray(payload.table.rows)) {
        throw new Error('INVALID_SHEET_SCHEMA');
    }
    return payload;
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT_MS);
    try {
        const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(PUBLISHED_SHEET)}`;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`GOOGLE_HTTP_${response.status}`);

        const payload = parseGoogleVisualizationPayload(await response.text());
        res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
        return res.status(200).json(payload);
    } catch (error) {
        const code = error?.name === 'AbortError' ? 'GOOGLE_TIMEOUT' : 'GOOGLE_UPSTREAM_ERROR';
        console.error(`[api/google-sheet] ${code}:`, error.message);
        return res.status(502).json({ error: code });
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = handler;
module.exports.parseGoogleVisualizationPayload = parseGoogleVisualizationPayload;
