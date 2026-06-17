import { cors } from "../lib/cors.js";
import { query } from "../lib/db.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { task_id, user_id, completion_date, status, value, notes, link } = req.body;
    await query(`INSERT INTO task_completions (task_id,user_id,completion_date,status,value,notes,link) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (task_id,user_id,completion_date) DO UPDATE SET status=$4, value=$5, notes=$6, link=$7, updated_at=NOW()`,
      [task_id, user_id, completion_date, status, value || 0, notes, link]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
