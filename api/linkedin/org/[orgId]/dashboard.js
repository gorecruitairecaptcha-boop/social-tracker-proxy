import { cors } from "../../../../lib/cors.js";
import { query, liFetch, getTokenOrDB } from "../../../../lib/db.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    const token = await getTokenOrDB(req);
    if (!token) return res.status(401).json({ error: "LinkedIn token not configured. Ask admin to set it in Settings." });
    const { orgId } = req.query;
    const LI = "https://api.linkedin.com/v2";
    const urn = encodeURIComponent(`urn:li:organization:${orgId}`);
    const [networkSize, shareStats, pageStats] = await Promise.all([
      liFetch(`${LI}/networkSizes/${urn}?edgeType=CompanyFollowedByMember`, token),
      liFetch(`${LI}/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${urn}`, token),
      liFetch(`${LI}/organizationPageStatistics?q=organization&organization=${urn}`, token),
    ]);
    const totalFollowers = networkSize.data?.firstDegreeSize || 0;
    const sStats = (shareStats.data?.elements || [])[0]?.totalShareStatistics || {};
    let pageViews = 0, uniqueVisitors = 0;
    (pageStats.data?.elements || []).forEach(el => { if (el.totalPageStatistics) { pageViews = el.totalPageStatistics.views?.allPageViews?.pageViews || 0; uniqueVisitors = el.totalPageStatistics.views?.allPageViews?.uniquePageViews || 0; } });

    const result = { orgId, timestamp: new Date().toISOString(), totalFollowers, impressions: sStats.impressionCount || 0, clicks: sStats.clickCount || 0, likes: sStats.likeCount || 0, comments: sStats.commentCount || 0, shares: sStats.shareCount || 0, engagement: sStats.engagement || 0, pageViews, uniqueVisitors };

    try {
      await query("INSERT INTO page_metrics (metric_date,page,followers,impressions,engagements,page_views,unique_visitors,clicks,source) VALUES (CURRENT_DATE,'techwaukee',$1,$2,$3,$4,$5,$6,'api') ON CONFLICT DO NOTHING",
        [totalFollowers, result.impressions, result.likes + result.comments + result.shares, pageViews, uniqueVisitors, result.clicks]);
    } catch {}

    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
}
