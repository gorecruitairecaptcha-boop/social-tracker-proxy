import { cors } from "../../lib/cors.js";
import { query } from "../../lib/db.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method === "GET") {
      const { rows } = await query("SELECT id,text,page,url,scheduled_at,org_id,status,error,published_at,created_at FROM scheduled_posts ORDER BY scheduled_at ASC");
      return res.json(rows);
    }
    if (req.method === "POST") {
      const { text, page, url, image_url, scheduled_at, org_id, access_token } = req.body;
      if (!text || !scheduled_at || !org_id) return res.status(400).json({ error: "text, scheduled_at, and org_id required" });
      const { rows } = await query("INSERT INTO scheduled_posts (text,page,url,image_url,scheduled_at,org_id,access_token,status) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING *",
        [text, page, url, image_url, scheduled_at, org_id, access_token]);
      return res.json(rows[0]);
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
