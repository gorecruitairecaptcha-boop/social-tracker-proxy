import { cors } from "../../lib/cors.js";
import { query } from "../../lib/db.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method === "GET") {
      const { rows } = await query("SELECT id, name, email, password, role, region, is_active FROM users ORDER BY role, name");
      return res.json(rows);
    }
    if (req.method === "POST") {
      const { name, email, password, role, region } = req.body;
      const { rows } = await query("INSERT INTO users (name, email, password, role, region) VALUES ($1,$2,$3,$4,$5) RETURNING *", [name, email, password, role || "member", region || "India"]);
      return res.json(rows[0]);
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
