/**
 * Social Tracker API + LinkedIn Proxy + PostgreSQL
 * Deployed on Render.com (free tier)
 */

import express from "express";
import cors from "cors";
import pg from "pg";

const app = express();
const PORT = process.env.PORT || 3001;

// ── Database ──
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://appone:dgDXXJ5DR5F94USSHlHLaEwEZ0sDZum7@dpg-d8gkqta8qa3s739fbvbg-a/socialtracker",
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(150) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, role VARCHAR(20) DEFAULT 'member', region VARCHAR(20) DEFAULT 'India', is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY, title VARCHAR(300) NOT NULL, description TEXT, category VARCHAR(50), region VARCHAR(20) DEFAULT 'all', page VARCHAR(20) DEFAULT 'both', priority VARCHAR(10) DEFAULT 'medium', target_value INT DEFAULT 1, due_date DATE, recurring BOOLEAN DEFAULT false, recurrence VARCHAR(20) DEFAULT 'daily', status VARCHAR(20) DEFAULT 'pending', assigned_to VARCHAR(50), assigned_by VARCHAR(50), created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS task_completions (id SERIAL PRIMARY KEY, task_id INT REFERENCES tasks(id) ON DELETE CASCADE, user_id INT REFERENCES users(id) ON DELETE CASCADE, completion_date DATE NOT NULL, status VARCHAR(20) DEFAULT 'pending', value INT DEFAULT 0, notes TEXT, link VARCHAR(500), updated_at TIMESTAMP DEFAULT NOW(), UNIQUE(task_id, user_id, completion_date));
      CREATE TABLE IF NOT EXISTS posts (id SERIAL PRIMARY KEY, post_date DATE NOT NULL, page VARCHAR(20) NOT NULL, content_type VARCHAR(50), title VARCHAR(300), notes TEXT, full_text TEXT, hashtags VARCHAR(500), likes INT DEFAULT 0, comments INT DEFAULT 0, shares INT DEFAULT 0, impressions INT DEFAULT 0, post_link VARCHAR(500), linkedin_urn VARCHAR(300), added_by VARCHAR(50), last_synced_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS page_metrics (id SERIAL PRIMARY KEY, metric_date DATE NOT NULL, page VARCHAR(20) NOT NULL, followers INT DEFAULT 0, new_followers INT DEFAULT 0, impressions INT DEFAULT 0, engagements INT DEFAULT 0, profile_views INT DEFAULT 0, post_reach INT DEFAULT 0, page_views INT DEFAULT 0, unique_visitors INT DEFAULT 0, clicks INT DEFAULT 0, engagement_rate DECIMAL(5,2) DEFAULT 0, source VARCHAR(20) DEFAULT 'manual', created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS employees (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, title VARCHAR(100), team VARCHAR(50), region VARCHAR(20) DEFAULT 'India', linkedin_url VARCHAR(300), photo_url VARCHAR(300), created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS engagement (id SERIAL PRIMARY KEY, post_id VARCHAR(50) NOT NULL, employee_id VARCHAR(50) NOT NULL, type VARCHAR(20) NOT NULL, date DATE NOT NULL, note TEXT, created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS api_config (id SERIAL PRIMARY KEY, config_key VARCHAR(50) UNIQUE NOT NULL, config_value TEXT, updated_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS share_pages (id VARCHAR(20) PRIMARY KEY, title VARCHAR(300), description VARCHAR(500), destination_url VARCHAR(500) NOT NULL, image_data TEXT, image_mime VARCHAR(50) DEFAULT 'image/png', created_at TIMESTAMP DEFAULT NOW());
    `);
    // Migrate: add columns that may be missing on existing DBs
    try { await client.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS full_text TEXT"); } catch {}
    try { await client.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS linkedin_urn VARCHAR(300)"); } catch {}
    // Seed default admin if empty
    const { rows } = await client.query("SELECT COUNT(*) as c FROM users");
    if (parseInt(rows[0].c) === 0) {
      await client.query(`INSERT INTO users (name, email, password, role, region) VALUES
        ('Admin', 'admin@techwaukee.com', 'admin123', 'admin', 'all'),
        ('Sneha Reddy', 'sneha@techwaukee.com', 'manager123', 'manager', 'India'),
        ('Priya Sharma', 'priya@techwaukee.com', 'member123', 'member', 'India')`);
      await client.query(`INSERT INTO employees (name, title, team, region, linkedin_url) VALUES
        ('Pavithra M', 'Team Lead', 'Recruitment', 'India', 'https://linkedin.com/in/pavithra-m'),
        ('Sandhya S', 'Team Lead', 'Recruitment', 'India', 'https://linkedin.com/in/sandhya-s'),
        ('Vaishnavi A', 'Recruiter', 'US Staffing', 'India', 'https://linkedin.com/in/vaishnavi-a'),
        ('Asfiya', 'Recruiter', 'US Staffing', 'India', 'https://linkedin.com/in/asfiya'),
        ('Abinaya J', 'Recruiter', 'India', 'India', 'https://linkedin.com/in/abinaya-j'),
        ('John', 'Recruiter', 'US Staffing', 'USA', 'https://linkedin.com/in/john'),
        ('Rajesh Kumar', 'Senior Recruiter', 'India', 'India', 'https://linkedin.com/in/rajesh-kumar'),
        ('Mike Chen', 'Senior Recruiter', 'US Staffing', 'USA', 'https://linkedin.com/in/mike-chen')`);
      await client.query(`INSERT INTO api_config (config_key, config_value) VALUES ('techwaukee_org_id', '15078287'), ('linkedin_client_id', '86rz73bd1rfacx'), ('linkedin_access_token', 'AQWI45juh_wEPuBSx24Hv6jzdiQ80uHaEn7vv6LqKgDGvhR_jWaceDbxAsOiR3bvw3ewmJ258CuMIn7px4oj4KIfCy0JWbK54AQVLJH2LIJvDPnEujYY8USUBA43FpY1G3BsaOmFXwZa84LSeYU6jD03W5LwagxZp6pIhvWB9RyQ8D6eHsrGoQLnumvgGfAjVDOqyMnvZkEhLwdJIx1CTSWCkALhT9Txyok8m6RlSq3ZT4VSLxcVOWJvDJFvwdg_o1ctv2HbGNAYikcw4a3-yd4HYu9j2Dsb1GerRokSmdQZYsJ1EVZHyofh5k7N78OLoiGtTAKullkJVpkO3Etpx-JZPTtpsw')`);
      console.log("[DB] Seeded default data");
    }
    // Ensure token is in DB
    const tokenCheck = await client.query("SELECT config_value FROM api_config WHERE config_key = 'linkedin_access_token'");
    if (tokenCheck.rows.length === 0 || !tokenCheck.rows[0].config_value) {
      await client.query(`INSERT INTO api_config (config_key, config_value) VALUES ('linkedin_access_token', 'AQWI45juh_wEPuBSx24Hv6jzdiQ80uHaEn7vv6LqKgDGvhR_jWaceDbxAsOiR3bvw3ewmJ258CuMIn7px4oj4KIfCy0JWbK54AQVLJH2LIJvDPnEujYY8USUBA43FpY1G3BsaOmFXwZa84LSeYU6jD03W5LwagxZp6pIhvWB9RyQ8D6eHsrGoQLnumvgGfAjVDOqyMnvZkEhLwdJIx1CTSWCkALhT9Txyok8m6RlSq3ZT4VSLxcVOWJvDJFvwdg_o1ctv2HbGNAYikcw4a3-yd4HYu9j2Dsb1GerRokSmdQZYsJ1EVZHyofh5k7N78OLoiGtTAKullkJVpkO3Etpx-JZPTtpsw') ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value`);
      console.log("[DB] Access token saved");
    }
    // Migrate: add full_text and image_url columns to posts if missing
    try { await client.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS full_text TEXT"); } catch {}
    try { await client.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_url TEXT"); } catch {}
    try { await client.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS linkedin_urn VARCHAR(200)"); } catch {}
    console.log("[DB] Tables ready");
  } finally { client.release(); }
}

app.use(cors());
app.use(express.json({ limit: "10mb" })); // Allow larger payloads for image upload

// ── Helper: LinkedIn fetch ──
async function liFetch(url, token, options = {}) {
  const res = await fetch(url, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${token}`, "LinkedIn-Version": "202604", "X-Restli-Protocol-Version": "2.0.0", "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  const postUrn = res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id") || null;
  return { error: !res.ok, status: res.status, data, postUrn };
}

function getToken(req) { const a = req.headers.authorization; return a?.startsWith("Bearer ") ? a.slice(7) : null; }

// ══ Health ══
app.get("/", (req, res) => res.json({ status: "ok", server: "Social Tracker API" }));
app.get("/api/health", async (req, res) => {
  try { await pool.query("SELECT 1"); res.json({ status: "ok", db: "connected" }); }
  catch (e) { res.json({ status: "ok", db: "error", error: e.message }); }
});

// ══ AUTH ══
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows } = await pool.query("SELECT id, name, email, role, region FROM users WHERE email = $1 AND password = $2 AND is_active = true", [email, password]);
    if (rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });
    res.json({ user: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══ USERS ══
app.get("/api/users", async (req, res) => {
  try { const { rows } = await pool.query("SELECT id, name, email, password, role, region, is_active FROM users ORDER BY role, name"); res.json(rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/users", async (req, res) => {
  try {
    const { name, email, password, role, region } = req.body;
    const { rows } = await pool.query("INSERT INTO users (name, email, password, role, region) VALUES ($1,$2,$3,$4,$5) RETURNING *", [name, email, password, role || "member", region || "India"]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put("/api/users/:id", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    await pool.query("UPDATE users SET name=$1, email=$2, password=$3, role=$4 WHERE id=$5", [name, email, password, role, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/users/:id", async (req, res) => {
  try { await pool.query("UPDATE users SET is_active=false WHERE id=$1", [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ══ TASKS ══
app.get("/api/tasks", async (req, res) => {
  try { const { rows } = await pool.query("SELECT * FROM tasks ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, due_date ASC NULLS LAST"); res.json(rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/tasks", async (req, res) => {
  try {
    const { title, description, category, region, page, priority, target_value, due_date, recurring, recurrence, status, assigned_to, assigned_by } = req.body;
    const { rows } = await pool.query("INSERT INTO tasks (title,description,category,region,page,priority,target_value,due_date,recurring,recurrence,status,assigned_to,assigned_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *",
      [title, description, category, region, page, priority, target_value, due_date || null, recurring, recurrence, status || "pending", assigned_to, assigned_by]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put("/api/tasks/:id", async (req, res) => {
  try {
    const { status } = req.body;
    await pool.query("UPDATE tasks SET status=$1 WHERE id=$2", [status, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/tasks/:id", async (req, res) => {
  try { await pool.query("DELETE FROM tasks WHERE id=$1", [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ══ TASK COMPLETIONS ══
app.post("/api/task-completions", async (req, res) => {
  try {
    const { task_id, user_id, completion_date, status, value, notes, link } = req.body;
    await pool.query(`INSERT INTO task_completions (task_id,user_id,completion_date,status,value,notes,link) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (task_id,user_id,completion_date) DO UPDATE SET status=$4, value=$5, notes=$6, link=$7, updated_at=NOW()`,
      [task_id, user_id, completion_date, status, value || 0, notes, link]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══ POSTS ══
app.get("/api/posts", async (req, res) => {
  try { const { rows } = await pool.query("SELECT * FROM posts ORDER BY post_date DESC"); res.json(rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/posts", async (req, res) => {
  try {
    const { post_date, page, content_type, title, notes, full_text, hashtags, likes, comments, shares, impressions, post_link, linkedin_urn, added_by } = req.body;
    const { rows } = await pool.query("INSERT INTO posts (post_date,page,content_type,title,notes,full_text,hashtags,likes,comments,shares,impressions,post_link,linkedin_urn,added_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *",
      [post_date, page, content_type, title, notes, full_text, hashtags, likes||0, comments||0, shares||0, impressions||0, post_link, linkedin_urn, added_by]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put("/api/posts/:id", async (req, res) => {
  try {
    const { post_link, linkedin_urn, full_text, image_url } = req.body;
    const sets = []; const vals = []; let idx = 1;
    if (post_link !== undefined) { sets.push(`post_link=$${idx++}`); vals.push(post_link); }
    if (linkedin_urn !== undefined) { sets.push(`linkedin_urn=$${idx++}`); vals.push(linkedin_urn); }
    if (full_text !== undefined) { sets.push(`full_text=$${idx++}`); vals.push(full_text); }
    if (image_url !== undefined) { sets.push(`image_url=$${idx++}`); vals.push(image_url); }
    if (sets.length === 0) return res.json({ success: true });
    vals.push(req.params.id);
    await pool.query(`UPDATE posts SET ${sets.join(",")} WHERE id=$${idx}`, vals);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/posts/:id", async (req, res) => {
  try { await pool.query("DELETE FROM posts WHERE id=$1", [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ══ PAGE METRICS ══
app.get("/api/metrics", async (req, res) => {
  try {
    const { page } = req.query;
    const q = page ? "SELECT * FROM page_metrics WHERE page=$1 ORDER BY metric_date DESC" : "SELECT * FROM page_metrics ORDER BY metric_date DESC";
    const { rows } = page ? await pool.query(q, [page]) : await pool.query(q);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/metrics", async (req, res) => {
  try {
    const { metric_date, page, followers, new_followers, impressions, engagements, profile_views, post_reach, page_views, unique_visitors, clicks, source } = req.body;
    const rate = impressions > 0 ? ((engagements / impressions) * 100).toFixed(2) : 0;
    const { rows } = await pool.query("INSERT INTO page_metrics (metric_date,page,followers,new_followers,impressions,engagements,profile_views,post_reach,page_views,unique_visitors,clicks,engagement_rate,source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *",
      [metric_date, page, followers||0, new_followers||0, impressions||0, engagements||0, profile_views||0, post_reach||0, page_views||0, unique_visitors||0, clicks||0, rate, source||"manual"]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══ EMPLOYEES ══
app.get("/api/employees", async (req, res) => {
  try { const { rows } = await pool.query("SELECT * FROM employees ORDER BY name"); res.json(rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/employees", async (req, res) => {
  try {
    const { name, title, team, region, linkedin_url, photo_url } = req.body;
    const { rows } = await pool.query("INSERT INTO employees (name,title,team,region,linkedin_url,photo_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *", [name, title, team, region, linkedin_url, photo_url]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put("/api/employees/:id", async (req, res) => {
  try {
    const { name, title, team, region, linkedin_url, photo_url } = req.body;
    await pool.query("UPDATE employees SET name=$1,title=$2,team=$3,region=$4,linkedin_url=$5,photo_url=$6 WHERE id=$7", [name, title, team, region, linkedin_url, photo_url, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/employees/:id", async (req, res) => {
  try { await pool.query("DELETE FROM employees WHERE id=$1", [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ══ ENGAGEMENT ══
app.get("/api/engagement", async (req, res) => {
  try { const { rows } = await pool.query("SELECT * FROM engagement ORDER BY date DESC"); res.json(rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/engagement", async (req, res) => {
  try {
    const { post_id, employee_id, type, date, note } = req.body;
    const { rows } = await pool.query("INSERT INTO engagement (post_id,employee_id,type,date,note) VALUES ($1,$2,$3,$4,$5) RETURNING *", [post_id, employee_id, type, date, note]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/engagement/:id", async (req, res) => {
  try { await pool.query("DELETE FROM engagement WHERE id=$1", [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ══ LINKEDIN PROXY ══
app.get("/api/linkedin/org/:orgId/dashboard", async (req, res) => {
  try {
    const token = await getTokenOrDB(req);
    if (!token) return res.status(401).json({ error: "LinkedIn token not configured. Ask admin to set it in Settings." });
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
    (pageStats.data?.elements || []).forEach(el => { if (el.totalPageStatistics) { pageViews = el.totalPageStatistics.views?.allPageViews?.pageViews || 0; uniqueVisitors = el.totalPageStatistics.views?.allPageViews?.uniquePageViews || 0; } });

    const result = { orgId, timestamp: new Date().toISOString(), totalFollowers, impressions: sStats.impressionCount || 0, clicks: sStats.clickCount || 0, likes: sStats.likeCount || 0, comments: sStats.commentCount || 0, shares: sStats.shareCount || 0, engagement: sStats.engagement || 0, pageViews, uniqueVisitors };

    // Auto-save to DB
    try {
      await pool.query("INSERT INTO page_metrics (metric_date,page,followers,impressions,engagements,page_views,unique_visitors,clicks,source) VALUES (CURRENT_DATE,'techwaukee',$1,$2,$3,$4,$5,$6,'api') ON CONFLICT DO NOTHING",
        [totalFollowers, result.impressions, result.likes + result.comments + result.shares, pageViews, uniqueVisitors, result.clicks]);
    } catch {}

    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══ SHARE PAGES — Upload images to imgbb (always fast), OG pages on Render ══
const PROXY_BASE = process.env.RENDER_EXTERNAL_URL || "https://social-tracker-proxy.onrender.com";
const IMGBB_KEY = process.env.IMGBB_KEY || ""; // Set in Render env vars

// Keep-alive: ping self every 14 min so Render doesn't sleep
setInterval(() => { fetch(`${PROXY_BASE}/api/health`).catch(() => {}); }, 14 * 60 * 1000);

// Upload image to imgbb (free, fast CDN, permanent URLs)
async function uploadToImgBB(base64Data) {
  if (!IMGBB_KEY) return null;
  try {
    const form = new URLSearchParams();
    form.append("key", IMGBB_KEY);
    form.append("image", base64Data);
    const res = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: form });
    const data = await res.json();
    if (data.success) return data.data.url; // Returns permanent CDN URL
  } catch (e) { console.log("[IMGBB] Upload failed:", e.message); }
  return null;
}

// Create a share page
app.post("/api/share", async (req, res) => {
  try {
    const { title, description, destination_url, image_base64 } = req.body;
    if (!destination_url) return res.status(400).json({ error: "destination_url required" });
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    // Upload image to imgbb CDN (fast, always online)
    let imgUrl = "";
    if (image_base64) {
      const clean = image_base64.includes(",") ? image_base64.split(",")[1] : image_base64;
      imgUrl = await uploadToImgBB(clean) || "";
      if (imgUrl) console.log(`[SHARE] Image on imgbb: ${imgUrl}`);
      else console.log("[SHARE] imgbb upload failed, falling back to Render hosting");
    }

    // If imgbb failed, store in DB as fallback
    await pool.query(`CREATE TABLE IF NOT EXISTS share_pages (id VARCHAR(20) PRIMARY KEY, title VARCHAR(300), description VARCHAR(500), destination_url VARCHAR(500) NOT NULL, image_url VARCHAR(500), image_data TEXT, created_at TIMESTAMP DEFAULT NOW())`);
    await pool.query("INSERT INTO share_pages (id, title, description, destination_url, image_url, image_data) VALUES ($1,$2,$3,$4,$5,$6)",
      [id, title || "", description || "", destination_url, imgUrl || null, (!imgUrl && image_base64) ? image_base64 : null]);

    const shareUrl = `${PROXY_BASE}/s/${id}`;
    console.log(`[SHARE] Page: ${shareUrl}`);
    res.json({ success: true, shareUrl, imageUrl: imgUrl, id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Serve hosted image fallback (from DB, if imgbb failed)
app.get("/img/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT image_data FROM share_pages WHERE id = $1", [req.params.id]);
    if (rows.length === 0 || !rows[0].image_data) return res.status(404).send("Not found");
    const raw = rows[0].image_data;
    const base64 = raw.includes(",") ? raw.split(",")[1] : raw;
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=31536000");
    res.send(Buffer.from(base64, "base64"));
  } catch (e) { res.status(500).send("Error"); }
});

// OG meta page — LinkedIn bot scrapes this
app.get("/s/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM share_pages WHERE id = $1", [req.params.id]);
    if (rows.length === 0) return res.status(404).send("Not found");
    const p = rows[0];
    // Use imgbb URL if available, otherwise fall back to Render-hosted image
    const imgUrl = p.image_url || (p.image_data ? `${PROXY_BASE}/img/${p.id}` : "");
    const safeTitle = (p.title || "Techwaukee").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const safeDesc = (p.description || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");

    res.set("Content-Type", "text/html");
    res.send(`<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta property="og:type" content="website"/>
<meta property="og:title" content="${safeTitle}"/>
<meta property="og:description" content="${safeDesc}"/>
${imgUrl ? `<meta property="og:image" content="${imgUrl}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="627"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:image" content="${imgUrl}"/>` : ""}
<meta property="og:url" content="${PROXY_BASE}/s/${p.id}"/>
<title>${safeTitle}</title>
</head><body>
<script>window.location.href="${p.destination_url.replace(/"/g, '\\"')}";</script>
<p>Redirecting to <a href="${p.destination_url}">${safeTitle}</a>...</p>
</body></html>`);
  } catch (e) { res.status(500).send("Error"); }
});

// ══ SHARED LINKEDIN SETTINGS (stored in DB for all users) ══
app.get("/api/linkedin-settings", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT config_key, config_value FROM api_config WHERE config_key IN ('linkedin_access_token','proxy_url','techwaukee_org_id','gorecruitai_org_id','linkedin_client_id')");
    const config = {};
    rows.forEach(r => { config[r.config_key] = r.config_value; });
    // Don't expose full token to client — just indicate if set
    if (config.linkedin_access_token) config.has_token = true;
    res.json(config);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/linkedin-settings", async (req, res) => {
  try {
    const entries = Object.entries(req.body);
    for (const [key, value] of entries) {
      await pool.query(`INSERT INTO api_config (config_key, config_value) VALUES ($1, $2)
        ON CONFLICT (config_key) DO UPDATE SET config_value = $2, updated_at = NOW()`, [key, value || ""]);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Helper: get token from request header OR from database
async function getTokenOrDB(req) {
  const headerToken = getToken(req);
  if (headerToken) return headerToken;
  try {
    const { rows } = await pool.query("SELECT config_value FROM api_config WHERE config_key = 'linkedin_access_token'");
    return rows[0]?.config_value || null;
  } catch { return null; }
}

app.post("/api/linkedin/post", async (req, res) => {
  try {
    const token = await getTokenOrDB(req);
    if (!token) return res.status(401).json({ error: "LinkedIn token not configured. Ask admin to set it in Settings." });
    const { orgId, text, url, imageUrl } = req.body;
    if (!orgId || !text) return res.status(400).json({ error: "Missing orgId or text" });
    console.log(`[POST] commentary length: ${text.length}, first 80: "${text.slice(0, 80)}"`);
    // NEVER create article/link card content — LinkedIn hides commentary text on org pages when link cards are present
    const postBody = {
      author: `urn:li:organization:${orgId}`, commentary: text, visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false,
    };
    const result = await liFetch("https://api.linkedin.com/rest/posts", token, { method: "POST", body: postBody });
    if (result.error) return res.status(result.status).json({ success: false, error: result.data?.message || "Failed", data: result.data });
    const liUrn = result.postUrn || null;
    const liLink = liUrn ? `https://www.linkedin.com/feed/update/${liUrn}` : "";
    const pageName = orgId === "15078287" ? "techwaukee" : "gorecruitai";
    try { await pool.query("INSERT INTO posts (post_date,page,content_type,title,notes,full_text,post_link,linkedin_urn,added_by) VALUES (CURRENT_DATE,$1,$2,$3,'Published via API',$4,$5,$6,'api')",
      [pageName, "Text Post", text.slice(0, 300), text, liLink, liUrn]); } catch {}
    res.json({ success: true, data: result.data, linkedinUrl: liLink, linkedinUrn: liUrn, textLength: text.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══ SCHEDULED POSTS ══
// Save a scheduled post
app.post("/api/scheduled-posts", async (req, res) => {
  try {
    const { text, page, url, image_url, scheduled_at, org_id, access_token } = req.body;
    if (!text || !scheduled_at || !org_id) return res.status(400).json({ error: "text, scheduled_at, and org_id required" });
    await pool.query(`CREATE TABLE IF NOT EXISTS scheduled_posts (
      id SERIAL PRIMARY KEY, text TEXT NOT NULL, page VARCHAR(20), url VARCHAR(500),
      image_url TEXT, scheduled_at TIMESTAMP NOT NULL, org_id VARCHAR(50) NOT NULL,
      access_token TEXT, status VARCHAR(20) DEFAULT 'pending', error TEXT,
      published_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW()
    )`);
    const { rows } = await pool.query("INSERT INTO scheduled_posts (text,page,url,image_url,scheduled_at,org_id,access_token,status) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING *",
      [text, page, url, image_url, scheduled_at, org_id, access_token]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/scheduled-posts", async (req, res) => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS scheduled_posts (
      id SERIAL PRIMARY KEY, text TEXT, page VARCHAR(20), url VARCHAR(500),
      image_url TEXT, scheduled_at TIMESTAMP, org_id VARCHAR(50),
      access_token TEXT, status VARCHAR(20) DEFAULT 'pending', error TEXT,
      published_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW()
    )`);
    const { rows } = await pool.query("SELECT id,text,page,url,scheduled_at,org_id,status,error,published_at,created_at FROM scheduled_posts ORDER BY scheduled_at ASC");
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/scheduled-posts/:id", async (req, res) => {
  try { await pool.query("DELETE FROM scheduled_posts WHERE id=$1", [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ══ LINKEDIN IMAGE UPLOAD ══
// Step 1: Register image upload, Step 2: Upload binary, Step 3: Use asset in post
app.post("/api/linkedin/upload-image", async (req, res) => {
  try {
    const token = await getTokenOrDB(req);
    if (!token) return res.status(401).json({ error: "Missing Bearer token" });
    const { orgId, imageBase64, mimeType } = req.body;
    if (!orgId || !imageBase64) return res.status(400).json({ error: "orgId and imageBase64 required" });

    // Step 1: Register upload
    const registerBody = {
      initializeUploadRequest: {
        owner: `urn:li:organization:${orgId}`,
      }
    };
    const regResult = await liFetch("https://api.linkedin.com/rest/images?action=initializeUpload", token, { method: "POST", body: registerBody });
    if (regResult.error) return res.status(regResult.status).json({ error: "Failed to register image upload", data: regResult.data });

    const uploadUrl = regResult.data?.value?.uploadUrl;
    const imageUrn = regResult.data?.value?.image;
    if (!uploadUrl || !imageUrn) return res.status(500).json({ error: "No upload URL returned from LinkedIn" });

    // Step 2: Upload binary
    const imageBuffer = Buffer.from(imageBase64, "base64");
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": mimeType || "image/png",
      },
      body: imageBuffer,
    });
    if (!uploadRes.ok) return res.status(uploadRes.status).json({ error: `Image upload failed: ${uploadRes.status}` });

    res.json({ success: true, imageUrn });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Post with uploaded image
app.post("/api/linkedin/post-with-image", async (req, res) => {
  try {
    const token = await getTokenOrDB(req);
    if (!token) return res.status(401).json({ error: "Missing Bearer token" });
    const { orgId, text, imageUrn, url } = req.body;
    if (!orgId || !text) return res.status(400).json({ error: "orgId and text required" });
    console.log(`[POST-IMAGE] commentary length: ${text.length}, first 80: "${text.slice(0, 80)}"`);

    const postBody = {
      author: `urn:li:organization:${orgId}`,
      commentary: text,
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };

    // NEVER create article/link card content — LinkedIn hides commentary text on org pages when link cards are present
    if (imageUrn) {
      postBody.content = { media: { id: imageUrn } };
      if (url?.trim()) postBody.content.media.altText = `Click to visit: ${url}`;
    }

    const result = await liFetch("https://api.linkedin.com/rest/posts", token, { method: "POST", body: postBody });
    if (result.error) return res.status(result.status).json({ success: false, error: result.data?.message || "Failed", data: result.data });

    const liUrn = result.postUrn || null;
    const liLink = liUrn ? `https://www.linkedin.com/feed/update/${liUrn}` : "";
    const pageName = orgId === "15078287" ? "techwaukee" : "gorecruitai";
    try { await pool.query("INSERT INTO posts (post_date,page,content_type,title,notes,full_text,post_link,linkedin_urn,added_by) VALUES (CURRENT_DATE,$1,$2,$3,'Published via API',$4,$5,$6,'api')",
      [pageName, imageUrn ? "Image Post" : "Text Post", text.slice(0, 300), text, liLink, liUrn]); } catch {}

    res.json({ success: true, data: result.data, linkedinUrl: liLink, linkedinUrn: liUrn, textLength: text.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══ SYNC: Fetch post engagement stats from LinkedIn ══
app.get("/api/linkedin/post-stats/:urn", async (req, res) => {
  try {
    const token = await getTokenOrDB(req);
    if (!token) return res.status(401).json({ error: "Token not configured" });
    const { urn } = req.params;
    const decoded = decodeURIComponent(urn);
    console.log(`[SYNC] Fetching stats for: ${decoded}`);

    // Try REST API first (newer), fall back to v2
    let result = await liFetch(`https://api.linkedin.com/rest/socialMetadata/${encodeURIComponent(decoded)}`, token);
    if (result.error) {
      // Fallback: v2 socialActions
      result = await liFetch(`https://api.linkedin.com/v2/socialActions/${encodeURIComponent(decoded)}`, token);
    }

    if (result.error) {
      console.log(`[SYNC] Error fetching stats:`, JSON.stringify(result.data));
      return res.status(result.status).json({ error: result.data?.message || "Failed to fetch stats", data: result.data });
    }

    const d = result.data;
    const stats = {
      likeCount: d.likesSummary?.totalLikes ?? d.likes?.length ?? d.numLikes ?? 0,
      commentCount: d.commentsSummary?.aggregatedTotalComments ?? d.comments?.length ?? d.numComments ?? 0,
      shareCount: d.sharesSummary?.totalShares ?? d.numShares ?? 0,
    };
    console.log(`[SYNC] Stats for ${decoded}: likes=${stats.likeCount}, comments=${stats.commentCount}, shares=${stats.shareCount}`);

    // Also update DB
    try {
      await pool.query("UPDATE posts SET likes=$1, comments=$2, shares=$3, last_synced_at=NOW() WHERE linkedin_urn=$4", [stats.likeCount, stats.commentCount, stats.shareCount, decoded]);
    } catch {}

    res.json(stats);
  } catch (err) {
    console.log(`[SYNC] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ══ SCHEDULER: Auto-publish scheduled posts ══
async function checkScheduledPosts() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS scheduled_posts (
      id SERIAL PRIMARY KEY, text TEXT, page VARCHAR(20), url VARCHAR(500),
      image_url TEXT, scheduled_at TIMESTAMP, org_id VARCHAR(50),
      access_token TEXT, status VARCHAR(20) DEFAULT 'pending', error TEXT,
      published_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW()
    )`);
    const { rows } = await pool.query("SELECT * FROM scheduled_posts WHERE status='pending' AND scheduled_at <= (NOW() AT TIME ZONE 'Asia/Kolkata')");
    if (rows.length === 0) return;

    // Get shared token from DB
    let sharedToken = null;
    try {
      const tokenRes = await pool.query("SELECT config_value FROM api_config WHERE config_key = 'linkedin_access_token'");
      sharedToken = tokenRes.rows[0]?.config_value || null;
    } catch {}

    for (const post of rows) {
      try {
        const token = post.access_token || sharedToken;
        if (!token) { await pool.query("UPDATE scheduled_posts SET status='failed', error='No access token configured. Ask admin to set it in Settings.' WHERE id=$1", [post.id]); continue; }
        console.log(`[SCHEDULER] Processing post ${post.id}, text length: ${post.text?.length}, has image: ${!!post.image_url}, has url: ${!!post.url}`);

        // If post has a base64 image, upload it to LinkedIn first
        let uploadedImageUrn = null;
        if (post.image_url && post.image_url.startsWith("data:")) {
          try {
            const base64 = post.image_url.split(",")[1] || post.image_url;
            const mimeMatch = post.image_url.match(/data:([^;]+);/);
            const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
            const registerBody = { initializeUploadRequest: { owner: `urn:li:organization:${post.org_id}` } };
            const regResult = await liFetch("https://api.linkedin.com/rest/images?action=initializeUpload", token, { method: "POST", body: registerBody });
            if (!regResult.error && regResult.data?.value?.uploadUrl) {
              const uploadUrl = regResult.data.value.uploadUrl;
              uploadedImageUrn = regResult.data.value.image;
              const imageBuffer = Buffer.from(base64, "base64");
              await fetch(uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": mimeType }, body: imageBuffer });
              console.log(`[SCHEDULER] Image uploaded for post ${post.id}: ${uploadedImageUrn}`);
            }
          } catch (imgErr) { console.log(`[SCHEDULER] Image upload failed for post ${post.id}: ${imgErr.message}`); }
        }

        const postBody = {
          author: `urn:li:organization:${post.org_id}`,
          commentary: post.text,
          visibility: "PUBLIC",
          distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
          lifecycleState: "PUBLISHED",
          isReshareDisabledByAuthor: false,
        };

        // NEVER create article/link card content — LinkedIn hides commentary text on org pages when link cards are present.
        // Image = image post; otherwise plain text post (URL stays in commentary text if the user included it).
        if (uploadedImageUrn) {
          postBody.content = { media: { id: uploadedImageUrn } };
          if (post.url?.trim()) postBody.content.media.altText = `Click to visit: ${post.url}`;
        }

        console.log(`[SCHEDULER] Sending to LinkedIn - commentary: ${post.text?.length} chars, content type: ${postBody.content ? Object.keys(postBody.content)[0] : "text-only"}`);
        const result = await liFetch("https://api.linkedin.com/rest/posts", token, { method: "POST", body: postBody });
        if (result.error) {
          await pool.query("UPDATE scheduled_posts SET status='failed', error=$1 WHERE id=$2", [result.data?.message || `HTTP ${result.status}`, post.id]);
          console.log(`[SCHEDULER] Failed post ${post.id}: ${result.data?.message}`);
        } else {
          const liUrn = result.postUrn || null;
          const liLink = liUrn ? `https://www.linkedin.com/feed/update/${liUrn}` : "";
          await pool.query("UPDATE scheduled_posts SET status='published', published_at=NOW() WHERE id=$1", [post.id]);
          const contentType = uploadedImageUrn ? "Image Post" : "Scheduled Post";
          await pool.query("INSERT INTO posts (post_date,page,content_type,title,notes,full_text,post_link,linkedin_urn,added_by) VALUES (CURRENT_DATE,$1,$2,$3,'Auto-published by scheduler',$4,$5,$6,'scheduler')",
            [post.page || "techwaukee", contentType, post.text.slice(0, 300), post.text, liLink, liUrn]);
          console.log(`[SCHEDULER] Published post ${post.id}, URN: ${liUrn}, text sent: ${post.text?.length} chars`);
        }
      } catch (e) {
        await pool.query("UPDATE scheduled_posts SET status='failed', error=$1 WHERE id=$2", [e.message, post.id]);
      }
    }
    console.log(`[SCHEDULER] Processed ${rows.length} scheduled posts`);
  } catch (e) { console.error("[SCHEDULER] Error:", e.message); }
}

// ── Start ──
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} with PostgreSQL`);
    // Check scheduled posts every 60 seconds
    setInterval(checkScheduledPosts, 60 * 1000);
    checkScheduledPosts(); // Run once on startup
    console.log("[SCHEDULER] Running every 60 seconds");
  });
}).catch(err => {
  console.error("DB init failed:", err.message);
  app.listen(PORT, () => console.log(`Server running on port ${PORT} (DB offline)`));
});
