import { cors } from "../lib/cors.js";
import { query } from "../lib/db.js";

const IMGBB_KEY = process.env.IMGBB_KEY || "";

async function uploadToImgBB(base64Data) {
  if (!IMGBB_KEY) return null;
  try {
    const form = new URLSearchParams();
    form.append("key", IMGBB_KEY);
    form.append("image", base64Data);
    const res = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: form });
    const data = await res.json();
    if (data.success) return data.data.url;
  } catch (e) { console.log("[IMGBB] Upload failed:", e.message); }
  return null;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { title, description, destination_url, image_base64 } = req.body;
    if (!destination_url) return res.status(400).json({ error: "destination_url required" });
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    let imgUrl = "";
    if (image_base64) {
      const clean = image_base64.includes(",") ? image_base64.split(",")[1] : image_base64;
      imgUrl = await uploadToImgBB(clean) || "";
    }

    await query("INSERT INTO share_pages (id, title, description, destination_url, image_url, image_data) VALUES ($1,$2,$3,$4,$5,$6)",
      [id, title || "", description || "", destination_url, imgUrl || null, (!imgUrl && image_base64) ? image_base64 : null]);

    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
    const shareUrl = `${baseUrl}/api/s/${id}`;
    res.json({ success: true, shareUrl, imageUrl: imgUrl, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
}
