import { cors } from "../lib/cors.js";
import { query } from "../lib/db.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method === "GET") {
      const { rows } = await query("SELECT config_key, config_value FROM api_config WHERE config_key IN ('linkedin_access_token','proxy_url','techwaukee_org_id','gorecruitai_org_id','linkedin_client_id')");
      const config = {};
      rows.forEach(r => { config[r.config_key] = r.config_value; });
      if (config.linkedin_access_token) config.has_token = true;
      return res.json(config);
    }
    if (req.method === "POST") {
      const entries = Object.entries(req.body);
      for (const [key, value] of entries) {
        await query(`INSERT INTO api_config (config_key, config_value) VALUES ($1, $2)
          ON CONFLICT (config_key) DO UPDATE SET config_value = $2, updated_at = NOW()`, [key, value || ""]);
      }
      return res.json({ success: true });
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
