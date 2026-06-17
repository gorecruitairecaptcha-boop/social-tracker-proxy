import { cors } from "../lib/cors.js";
import { query, PROXY_VERSION } from "../lib/db.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    await query("SELECT 1");
    res.json({ status: "ok", db: "connected", version: PROXY_VERSION });
  } catch (e) {
    res.json({ status: "ok", db: "error", error: e.message, version: PROXY_VERSION });
  }
}
