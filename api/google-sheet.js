// ==========================================
// Vercel Serverless Function: /api/google-sheet
// Proxy an toàn gọi Google Sheets, giấu Sheet ID phía server
// ==========================================

export default async function handler(req, res) {
  // Chỉ cho phép GET
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) {
    return res.status(500).json({ error: "GOOGLE_SHEET_ID chưa được cấu hình trên server." });
  }

  // Nhận tên sheet từ query string, mặc định là sheet đầu tiên
  const sheetName = req.query.sheet || "";

  // Allowlist tên sheet hợp lệ (chống injection)
  const ALLOWED_SHEETS = ["DaXacThuc", "Form_Responses"];
  if (sheetName && !ALLOWED_SHEETS.includes(sheetName)) {
    return res.status(400).json({ error: "Tên sheet không hợp lệ." });
  }

  try {
    let url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:json`;
    if (sheetName) {
      url += `&sheet=${encodeURIComponent(sheetName)}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Google Sheets trả về lỗi: ${response.status}`);
    }

    const text = await response.text();

    // Google trả về dạng: google.visualization.Query.setResponse({...})
    // Cần parse bỏ wrapper lấy JSON bên trong
    const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\((.+)\);?\s*$/s);
    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error("Không thể parse response từ Google Sheets.");
    }

    const data = JSON.parse(jsonMatch[1]);

    // Cache 60 giây giảm tải Google Sheets
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json(data);
  } catch (err) {
    console.error("Google Sheet proxy error:", err.message);
    return res.status(502).json({ error: "Không thể lấy dữ liệu từ Google Sheets." });
  }
}
