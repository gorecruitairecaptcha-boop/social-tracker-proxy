import { cors } from "../../lib/cors.js";
import { query } from "../../lib/db.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method === "GET") {
      const { rows } = await query("SELECT * FROM engagement ORDER BY date DESC");
      return res.json(rows);
    }
    if (req.method === "POST") {
      const { post_id, employee_id, type, date, note } = req.body;
      const { rows } = await query("INSERT INTO engagement (post_id,employee_id,type,date,note) VALUES ($1,$2,$3,$4,$5) RETURNING *", [post_id, employee_id, type, date, note]);
      return res.json(rows[0]);
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
