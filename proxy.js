/**
 * LinkedIn API Proxy — Cloud Deployment (Render.com)
 * Handles CORS, forwards requests to LinkedIn API.
 * No database needed.
 */

import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

async function liFetch(url, token, options = {}) {
  const res = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": "202604",
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { error: !res.ok, status: res.status, data };
}

function getToken(req) {
  const auth = req.headers.authorization;
  return (auth && auth.startsWith("Bearer ")) ? auth.slice(7) : null;
}

// Health
app.get("/", (req, res) => res.json({ status: "ok", server: "Social Tracker LinkedIn Proxy" }));
app.get("/api/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

// Dashboard metrics
app.get("/api/linkedin/org/:orgId/dashboard", async (req, res) => {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: "Missing Bearer token" });
    const { orgId } = req.params;
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
    (pageStats.data?.elements || []).forEach(el => {
      if (el.totalPageStatistics) {
        pageViews = el.totalPageStatistics.views?.allPageViews?.pageViews || 0;
        uniqueVisitors = el.totalPageStatistics.views?.allPageViews?.uniquePageViews || 0;
      }
    });

    res.json({
      orgId, timestamp: new Date().toISOString(), totalFollowers,
      impressions: sStats.impressionCount || 0, clicks: sStats.clickCount || 0,
      likes: sStats.likeCount || 0, comments: sStats.commentCount || 0,
      shares: sStats.shareCount || 0, engagement: sStats.engagement || 0,
      pageViews, uniqueVisitors,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Post to LinkedIn
app.post("/api/linkedin/post", async (req, res) => {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ error: "Missing Bearer token" });
    const { orgId, text } = req.body;
    if (!orgId || !text) return res.status(400).json({ error: "Missing orgId or text" });
    const result = await liFetch("https://api.linkedin.com/rest/posts", token, {
      method: "POST",
      body: {
        author: `urn:li:organization:${orgId}`,
        commentary: text,
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      },
    });
    if (result.error) return res.status(result.status).json({ success: false, error: result.data?.message || "Failed", data: result.data });
    res.json({ success: true, data: result.data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
