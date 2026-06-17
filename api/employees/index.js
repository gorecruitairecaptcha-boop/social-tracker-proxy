import { cors } from "../../lib/cors.js";
import { query } from "../../lib/db.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method === "GET") {
      const { rows } = await query("SELECT * FROM employees ORDER BY name");
      return res.json(rows);
    }
    if (req.method === "POST") {
      const { name, title, team, region, linkedin_url, photo_url } = req.body;
      const { rows } = await query("INSERT INTO employees (name,title,team,region,linkedin_url,photo_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *", [name, title, team, region, linkedin_url, photo_url]);
      return res.json(rows[0]);
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
