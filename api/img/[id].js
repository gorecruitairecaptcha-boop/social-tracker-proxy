import { query } from "../../lib/db.js";

export default async function handler(req, res) {
  try {
    const { id } = req.query;
    const { rows } = await query("SELECT image_data FROM share_pages WHERE id = $1", [id]);
    if (rows.length === 0 || !rows[0].image_data) return res.status(404).send("Not found");
    const raw = rows[0].image_data;
    const base64 = raw.includes(",") ? raw.split(",")[1] : raw;
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=31536000");
    res.send(Buffer.from(base64, "base64"));
  } catch (e) { res.status(500).send("Error"); }
}
