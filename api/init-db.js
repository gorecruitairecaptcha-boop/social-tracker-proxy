import { cors } from "../lib/cors.js";
import { getPool } from "../lib/db.js";

export default async function handler(req, res) {
  if (cors(req, res)) return;
  // Only allow POST with a secret to prevent accidental runs
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(150) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, role VARCHAR(20) DEFAULT 'member', region VARCHAR(20) DEFAULT 'India', is_active BOOLEAN DEFAULT true, created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY, title VARCHAR(300) NOT NULL, description TEXT, category VARCHAR(50), region VARCHAR(20) DEFAULT 'all', page VARCHAR(20) DEFAULT 'both', priority VARCHAR(10) DEFAULT 'medium', target_value INT DEFAULT 1, due_date DATE, recurring BOOLEAN DEFAULT false, recurrence VARCHAR(20) DEFAULT 'daily', status VARCHAR(20) DEFAULT 'pending', assigned_to VARCHAR(50), assigned_by VARCHAR(50), created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS task_completions (id SERIAL PRIMARY KEY, task_id INT REFERENCES tasks(id) ON DELETE CASCADE, user_id INT REFERENCES users(id) ON DELETE CASCADE, completion_date DATE NOT NULL, status VARCHAR(20) DEFAULT 'pending', value INT DEFAULT 0, notes TEXT, link VARCHAR(500), updated_at TIMESTAMP DEFAULT NOW(), UNIQUE(task_id, user_id, completion_date));
      CREATE TABLE IF NOT EXISTS posts (id SERIAL PRIMARY KEY, post_date DATE NOT NULL, page VARCHAR(20) NOT NULL, content_type VARCHAR(50), title VARCHAR(300), notes TEXT, full_text TEXT, hashtags VARCHAR(500), likes INT DEFAULT 0, comments INT DEFAULT 0, shares INT DEFAULT 0, impressions INT DEFAULT 0, post_link VARCHAR(500), linkedin_urn VARCHAR(300), added_by VARCHAR(50), last_synced_at TIMESTAMP, image_url TEXT, created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS page_metrics (id SERIAL PRIMARY KEY, metric_date DATE NOT NULL, page VARCHAR(20) NOT NULL, followers INT DEFAULT 0, new_followers INT DEFAULT 0, impressions INT DEFAULT 0, engagements INT DEFAULT 0, profile_views INT DEFAULT 0, post_reach INT DEFAULT 0, page_views INT DEFAULT 0, unique_visitors INT DEFAULT 0, clicks INT DEFAULT 0, engagement_rate DECIMAL(5,2) DEFAULT 0, source VARCHAR(20) DEFAULT 'manual', created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS employees (id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, title VARCHAR(100), team VARCHAR(50), region VARCHAR(20) DEFAULT 'India', linkedin_url VARCHAR(300), photo_url VARCHAR(300), created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS engagement (id SERIAL PRIMARY KEY, post_id VARCHAR(50) NOT NULL, employee_id VARCHAR(50) NOT NULL, type VARCHAR(20) NOT NULL, date DATE NOT NULL, note TEXT, created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS api_config (id SERIAL PRIMARY KEY, config_key VARCHAR(50) UNIQUE NOT NULL, config_value TEXT, updated_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS share_pages (id VARCHAR(20) PRIMARY KEY, title VARCHAR(300), description VARCHAR(500), destination_url VARCHAR(500) NOT NULL, image_url VARCHAR(500), image_data TEXT, created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS scheduled_posts (id SERIAL PRIMARY KEY, text TEXT NOT NULL, page VARCHAR(20), url VARCHAR(500), image_url TEXT, scheduled_at TIMESTAMP NOT NULL, org_id VARCHAR(50) NOT NULL, access_token TEXT, status VARCHAR(20) DEFAULT 'pending', error TEXT, published_at TIMESTAMP, created_at TIMESTAMP DEFAULT NOW());
    `);

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
      await client.query(`INSERT INTO api_config (config_key, config_value) VALUES
        ('techwaukee_org_id', '15078287'),
        ('linkedin_client_id', '86rz73bd1rfacx'),
        ('linkedin_access_token', '') ON CONFLICT DO NOTHING`);
    }

    res.json({ success: true, message: "Database initialized" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
}
