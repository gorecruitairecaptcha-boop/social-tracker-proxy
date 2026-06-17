import { cors } from "../../../lib/cors.js";
import { query, liFetch, getTokenOrDB } from "../../../lib/db.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    const token = await getTokenOrDB(req);
    if (!token) return res.status(401).json({ error: "Token not configured" });
    const { urn } = req.query;
    const decoded = decodeURIComponent(urn);
    console.log(`[SYNC] Fetching stats for: ${decoded}`);

    let result = await liFetch(`https://api.linkedin.com/rest/socialMetadata/${encodeURIComponent(decoded)}`, token);
    if (result.error) {
      result = await liFetch(`https://api.linkedin.com/v2/socialActions/${encodeURIComponent(decoded)}`, token);
    }

    if (result.error) {
      return res.status(result.status).json({ error: result.data?.message || "Failed to fetch stats", data: result.data });
    }

    const d = result.data;
    const stats = {
      likeCount: d.likesSummary?.totalLikes ?? d.likes?.length ?? d.numLikes ?? 0,
      commentCount: d.commentsSummary?.aggregatedTotalComments ?? d.comments?.length ?? d.numComments ?? 0,
      shareCount: d.sharesSummary?.totalShares ?? d.numShares ?? 0,
    };

    try {
      await query("UPDATE posts SET likes=$1, comments=$2, shares=$3, last_synced_at=NOW() WHERE linkedin_urn=$4", [stats.likeCount, stats.commentCount, stats.shareCount, decoded]);
    } catch {}

    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
}
