import { query } from "../../lib/db.js";

export default async function handler(req, res) {
  try {
    const { id } = req.query;
    const { rows } = await query("SELECT * FROM share_pages WHERE id = $1", [id]);
    if (rows.length === 0) return res.status(404).send("Not found");
    const p = rows[0];
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
    const imgUrl = p.image_url || (p.image_data ? `${baseUrl}/api/img/${p.id}` : "");
    const safeTitle = (p.title || "Techwaukee").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const safeDesc = (p.description || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");

    res.setHeader("Content-Type", "text/html");
    res.send(`<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta property="og:type" content="website"/>
<meta property="og:title" content="${safeTitle}"/>
<meta property="og:description" content="${safeDesc}"/>
${imgUrl ? `<meta property="og:image" content="${imgUrl}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="627"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:image" content="${imgUrl}"/>` : ""}
<meta property="og:url" content="${baseUrl}/api/s/${p.id}"/>
<title>${safeTitle}</title>
</head><body>
<script>window.location.href="${p.destination_url.replace(/"/g, '\\"')}";</script>
<p>Redirecting to <a href="${p.destination_url}">${safeTitle}</a>...</p>
</body></html>`);
  } catch (e) { res.status(500).send("Error"); }
}
