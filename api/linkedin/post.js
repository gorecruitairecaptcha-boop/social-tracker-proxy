import { cors } from "../../lib/cors.js";
import { query, liFetch, getTokenOrDB, escapeLittleText } from "../../lib/db.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const token = await getTokenOrDB(req);
    if (!token) return res.status(401).json({ error: "LinkedIn token not configured. Ask admin to set it in Settings." });
    const { orgId, text } = req.body;
    if (!orgId || !text) return res.status(400).json({ error: "Missing orgId or text" });
    console.log(`[POST] commentary length: ${text.length}, first 80: "${text.slice(0, 80)}"`);
    // NEVER create article/link card content — LinkedIn hides commentary text on org pages when link cards are present
    const postBody = {
      author: `urn:li:organization:${orgId}`, commentary: escapeLittleText(text), visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false,
    };
    const result = await liFetch("https://api.linkedin.com/rest/posts", token, { method: "POST", body: postBody });
    if (result.error) return res.status(result.status).json({ success: false, error: result.data?.message || "Failed", data: result.data });
    const liUrn = result.postUrn || null;
    const liLink = liUrn ? `https://www.linkedin.com/feed/update/${liUrn}` : "";
    const pageName = orgId === "15078287" ? "techwaukee" : "gorecruitai";
    try { await query("INSERT INTO posts (post_date,page,content_type,title,notes,full_text,post_link,linkedin_urn,added_by) VALUES (CURRENT_DATE,$1,$2,$3,'Published via API',$4,$5,$6,'api')",
      [pageName, "Text Post", text.slice(0, 300), text, liLink, liUrn]); } catch {}
    res.json({ success: true, data: result.data, linkedinUrl: liLink, linkedinUrn: liUrn, textLength: text.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
