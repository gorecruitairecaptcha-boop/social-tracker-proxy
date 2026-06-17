import { cors } from "../lib/cors.js";
import { query } from "../lib/db.js";

// One-time data import endpoint — call POST with the exported JSON body
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const data = req.body;
    const results = {};

    // Import users
    if (data.users?.length) {
      for (const u of data.users) {
        try {
          await query("INSERT INTO users (id,name,email,password,role,region,is_active,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING",
            [u.id, u.name, u.email, u.password, u.role, u.region, u.is_active, u.created_at]);
        } catch {}
      }
      // Reset sequence
      await query("SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id),0) FROM users))");
      results.users = data.users.length;
    }

    // Import employees
    if (data.employees?.length) {
      for (const e of data.employees) {
        try {
          await query("INSERT INTO employees (id,name,title,team,region,linkedin_url,photo_url,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING",
            [e.id, e.name, e.title, e.team, e.region, e.linkedin_url, e.photo_url, e.created_at]);
        } catch {}
      }
      await query("SELECT setval('employees_id_seq', (SELECT COALESCE(MAX(id),0) FROM employees))");
      results.employees = data.employees.length;
    }

    // Import posts
    if (data.posts?.length) {
      for (const p of data.posts) {
        try {
          await query("INSERT INTO posts (id,post_date,page,content_type,title,notes,full_text,hashtags,likes,comments,shares,impressions,post_link,linkedin_urn,added_by,last_synced_at,image_url,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT (id) DO NOTHING",
            [p.id, p.post_date, p.page, p.content_type, p.title, p.notes, p.full_text, p.hashtags, p.likes, p.comments, p.shares, p.impressions, p.post_link, p.linkedin_urn, p.added_by, p.last_synced_at, p.image_url, p.created_at]);
        } catch {}
      }
      await query("SELECT setval('posts_id_seq', (SELECT COALESCE(MAX(id),0) FROM posts))");
      results.posts = data.posts.length;
    }

    // Import page_metrics
    if (data.metrics?.length) {
      for (const m of data.metrics) {
        try {
          await query("INSERT INTO page_metrics (id,metric_date,page,followers,new_followers,impressions,engagements,profile_views,post_reach,page_views,unique_visitors,clicks,engagement_rate,source,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (id) DO NOTHING",
            [m.id, m.metric_date, m.page, m.followers, m.new_followers, m.impressions, m.engagements, m.profile_views, m.post_reach, m.page_views, m.unique_visitors, m.clicks, m.engagement_rate, m.source, m.created_at]);
        } catch {}
      }
      await query("SELECT setval('page_metrics_id_seq', (SELECT COALESCE(MAX(id),0) FROM page_metrics))");
      results.metrics = data.metrics.length;
    }

    // Import api_config
    if (data.api_config?.length) {
      for (const c of data.api_config) {
        try {
          await query("INSERT INTO api_config (config_key, config_value, updated_at) VALUES ($1,$2,$3) ON CONFLICT (config_key) DO UPDATE SET config_value=$2, updated_at=$3",
            [c.config_key, c.config_value, c.updated_at]);
        } catch {}
      }
      results.api_config = data.api_config.length;
    }

    // Import scheduled_posts
    if (data.scheduled_posts?.length) {
      for (const s of data.scheduled_posts) {
        try {
          await query("INSERT INTO scheduled_posts (id,text,page,url,scheduled_at,org_id,status,error,published_at,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING",
            [s.id, s.text, s.page, s.url, s.scheduled_at, s.org_id, s.status, s.error, s.published_at, s.created_at]);
        } catch {}
      }
      await query("SELECT setval('scheduled_posts_id_seq', (SELECT COALESCE(MAX(id),0) FROM scheduled_posts))");
      results.scheduled_posts = data.scheduled_posts.length;
    }

    res.json({ success: true, imported: results });
  } catch (e) { res.status(500).json({ error: e.message }); }
}

export const config = {
  api: { bodyParser: { sizeLimit: "50mb" } }
};
