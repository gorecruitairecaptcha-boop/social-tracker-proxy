import { query, liFetch, escapeLittleText } from "../../lib/db.js";

export default async function handler(req, res) {
  // Verify cron secret (Vercel sends this header for cron jobs)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { rows } = await query("SELECT * FROM scheduled_posts WHERE status='pending' AND scheduled_at <= (NOW() AT TIME ZONE 'Asia/Kolkata')");
    if (rows.length === 0) return res.json({ processed: 0 });

    let sharedToken = null;
    try {
      const tokenRes = await query("SELECT config_value FROM api_config WHERE config_key = 'linkedin_access_token'");
      sharedToken = tokenRes.rows[0]?.config_value || null;
    } catch {}

    let published = 0, failed = 0;
    for (const post of rows) {
      try {
        const token = post.access_token || sharedToken;
        if (!token) { await query("UPDATE scheduled_posts SET status='failed', error='No access token configured.' WHERE id=$1", [post.id]); failed++; continue; }

        // Upload image if base64
        let uploadedImageUrn = null;
        if (post.image_url && post.image_url.startsWith("data:")) {
          try {
            const base64 = post.image_url.split(",")[1] || post.image_url;
            const mimeMatch = post.image_url.match(/data:([^;]+);/);
            const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
            const regResult = await liFetch("https://api.linkedin.com/rest/images?action=initializeUpload", token, {
              method: "POST", body: { initializeUploadRequest: { owner: `urn:li:organization:${post.org_id}` } }
            });
            if (!regResult.error && regResult.data?.value?.uploadUrl) {
              uploadedImageUrn = regResult.data.value.image;
              await fetch(regResult.data.value.uploadUrl, {
                method: "PUT",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": mimeType },
                body: Buffer.from(base64, "base64"),
              });
            }
          } catch {}
        }

        const postBody = {
          author: `urn:li:organization:${post.org_id}`,
          commentary: escapeLittleText(post.text),
          visibility: "PUBLIC",
          distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
          lifecycleState: "PUBLISHED",
          isReshareDisabledByAuthor: false,
        };

        if (uploadedImageUrn) {
          postBody.content = { media: { id: uploadedImageUrn } };
          if (post.url?.trim()) postBody.content.media.altText = `Click to visit: ${post.url}`;
        }

        const result = await liFetch("https://api.linkedin.com/rest/posts", token, { method: "POST", body: postBody });
        if (result.error) {
          await query("UPDATE scheduled_posts SET status='failed', error=$1 WHERE id=$2", [result.data?.message || `HTTP ${result.status}`, post.id]);
          failed++;
        } else {
          const liUrn = result.postUrn || null;
          const liLink = liUrn ? `https://www.linkedin.com/feed/update/${liUrn}` : "";
          await query("UPDATE scheduled_posts SET status='published', published_at=NOW() WHERE id=$1", [post.id]);
          const contentType = uploadedImageUrn ? "Image Post" : "Scheduled Post";
          await query("INSERT INTO posts (post_date,page,content_type,title,notes,full_text,post_link,linkedin_urn,added_by) VALUES (CURRENT_DATE,$1,$2,$3,'Auto-published by scheduler',$4,$5,$6,'scheduler')",
            [post.page || "techwaukee", contentType, post.text.slice(0, 300), post.text, liLink, liUrn]);
          published++;
        }
      } catch (e) {
        await query("UPDATE scheduled_posts SET status='failed', error=$1 WHERE id=$2", [e.message, post.id]);
        failed++;
      }
    }
    res.json({ processed: rows.length, published, failed });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
