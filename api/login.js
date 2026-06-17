import { cors } from "../lib/cors.js";
import { query } from "../lib/db.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { email, password } = req.body;
    const { rows } = await query("SELECT id, name, email, role, region FROM users WHERE email = $1 AND password = $2 AND is_active = true", [email, password]);
    if (rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });
    res.json({ user: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
