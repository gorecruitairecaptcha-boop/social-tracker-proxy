import { cors } from "../../lib/cors.js";
import { liFetch, getTokenOrDB } from "../../lib/db.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const token = await getTokenOrDB(req);
    if (!token) return res.status(401).json({ error: "Missing Bearer token" });
    const { orgId, imageBase64, mimeType } = req.body;
    if (!orgId || !imageBase64) return res.status(400).json({ error: "orgId and imageBase64 required" });

    // Step 1: Register upload
    const regResult = await liFetch("https://api.linkedin.com/rest/images?action=initializeUpload", token, {
      method: "POST",
      body: { initializeUploadRequest: { owner: `urn:li:organization:${orgId}` } }
    });
    if (regResult.error) return res.status(regResult.status).json({ error: "Failed to register image upload", data: regResult.data });

    const uploadUrl = regResult.data?.value?.uploadUrl;
    const imageUrn = regResult.data?.value?.image;
    if (!uploadUrl || !imageUrn) return res.status(500).json({ error: "No upload URL returned from LinkedIn" });

    // Step 2: Upload binary
    const imageBuffer = Buffer.from(imageBase64, "base64");
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": mimeType || "image/png" },
      body: imageBuffer,
    });
    if (!uploadRes.ok) return res.status(uploadRes.status).json({ error: `Image upload failed: ${uploadRes.status}` });

    res.json({ success: true, imageUrn });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
