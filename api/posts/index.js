import { cors } from "../../lib/cors.js";
import { query } from "../../lib/db.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method === "GET") {
      const { rows } = await query("SELECT * FROM posts ORDER BY post_date DESC");
      return res.json(rows);
    }
    if (req.method === "POST") {
      const { post_date, page, content_type, title, notes, full_text, hashtags, likes, comments, shares, impressions, post_link, linkedin_urn, added_by } = req.body;
      const { rows } = await query("INSERT INTO posts (post_date,page,content_type,title,notes,full_text,hashtags,likes,comments,shares,impressions,post_link,linkedin_urn,added_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *",
        [post_date, page, content_type, title, notes, full_text, hashtags, likes||0, comments||0, shares||0, impressions||0, post_link, linkedin_urn, added_by]);
      return res.json(rows[0]);
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
