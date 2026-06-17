import { cors } from "../../lib/cors.js";
import { query } from "../../lib/db.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  const { id } = req.query;
  try {
    if (req.method === "PUT") {
      const { status } = req.body;
      await query("UPDATE tasks SET status=$1 WHERE id=$2", [status, id]);
      return res.json({ success: true });
    }
    if (req.method === "DELETE") {
      await query("DELETE FROM tasks WHERE id=$1", [id]);
      return res.json({ success: true });
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
