import { cors } from "../../lib/cors.js";
import { query } from "../../lib/db.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const { id } = req.query;
  try {
    if (req.method === "PUT") {
      const { name, title, team, region, linkedin_url, photo_url } = req.body;
      await query("UPDATE employees SET name=$1,title=$2,team=$3,region=$4,linkedin_url=$5,photo_url=$6 WHERE id=$7", [name, title, team, region, linkedin_url, photo_url, id]);
      return res.json({ success: true });
    }
    if (req.method === "DELETE") {
      await query("DELETE FROM employees WHERE id=$1", [id]);
      return res.json({ success: true });
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
