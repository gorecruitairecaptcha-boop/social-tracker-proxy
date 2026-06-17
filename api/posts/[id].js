import { cors } from "../../lib/cors.js";
import { query } from "../../lib/db.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const { id } = req.query;
  try {
    if (req.method === "PUT") {
      const { post_link, linkedin_urn, full_text, image_url } = req.body;
      const sets = []; const vals = []; let idx = 1;
      if (post_link !== undefined) { sets.push(`post_link=$${idx++}`); vals.push(post_link); }
      if (linkedin_urn !== undefined) { sets.push(`linkedin_urn=$${idx++}`); vals.push(linkedin_urn); }
      if (full_text !== undefined) { sets.push(`full_text=$${idx++}`); vals.push(full_text); }
      if (image_url !== undefined) { sets.push(`image_url=$${idx++}`); vals.push(image_url); }
      if (sets.length === 0) return res.json({ success: true });
      vals.push(id);
      await query(`UPDATE posts SET ${sets.join(",")} WHERE id=$${idx}`, vals);
      return res.json({ success: true });
    }
    if (req.method === "DELETE") {
      await query("DELETE FROM posts WHERE id=$1", [id]);
      return res.json({ success: true });
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
