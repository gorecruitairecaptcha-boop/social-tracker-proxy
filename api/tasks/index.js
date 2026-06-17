import { cors } from "../../lib/cors.js";
import { query } from "../../lib/db.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method === "GET") {
      const { rows } = await query("SELECT * FROM tasks ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, due_date ASC NULLS LAST");
      return res.json(rows);
    }
    if (req.method === "POST") {
      const { title, description, category, region, page, priority, target_value, due_date, recurring, recurrence, status, assigned_to, assigned_by } = req.body;
      const { rows } = await query("INSERT INTO tasks (title,description,category,region,page,priority,target_value,due_date,recurring,recurrence,status,assigned_to,assigned_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *",
        [title, description, category, region, page, priority, target_value, due_date || null, recurring, recurrence, status || "pending", assigned_to, assigned_by]);
      return res.json(rows[0]);
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
