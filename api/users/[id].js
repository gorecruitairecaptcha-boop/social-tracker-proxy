import { cors } from "../../lib/cors.js";
import { query } from "../../lib/db.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const { id } = req.query;
  try {
    if (req.method === "PUT") {
      const { name, email, password, role } = req.body;
      await query("UPDATE users SET name=$1, email=$2, password=$3, role=$4 WHERE id=$5", [name, email, password, role, id]);
      return res.json({ success: true });
    }
    if (req.method === "DELETE") {
      await query("UPDATE users SET is_active=false WHERE id=$1", [id]);
      return res.json({ success: true });
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
