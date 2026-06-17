import { cors } from "../lib/cors.js";
import { query } from "../lib/db.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method === "GET") {
      const { page } = req.query;
      const q = page ? "SELECT * FROM page_metrics WHERE page=$1 ORDER BY metric_date DESC" : "SELECT * FROM page_metrics ORDER BY metric_date DESC";
      const { rows } = page ? await query(q, [page]) : await query(q);
      return res.json(rows);
    }
    if (req.method === "POST") {
      const { metric_date, page, followers, new_followers, impressions, engagements, profile_views, post_reach, page_views, unique_visitors, clicks, source } = req.body;
      const rate = impressions > 0 ? ((engagements / impressions) * 100).toFixed(2) : 0;
      const { rows } = await query("INSERT INTO page_metrics (metric_date,page,followers,new_followers,impressions,engagements,profile_views,post_reach,page_views,unique_visitors,clicks,engagement_rate,source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *",
        [metric_date, page, followers||0, new_followers||0, impressions||0, engagements||0, profile_views||0, post_reach||0, page_views||0, unique_visitors||0, clicks||0, rate, source||"manual"]);
      return res.json(rows[0]);
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
