import pg from "pg";

let pool;

export function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}

export async function query(text, params) {
  const res = await getPool().query(text, params);
  return res;
}

// LinkedIn fetch helper
export async function liFetch(url, token, options = {}) {
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
  const text2 = await res.text();
  let data;
  try { data = JSON.parse(text2); } catch { data = { raw: text2 }; }
  const postUrn = res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id") || null;
  return { error: !res.ok, status: res.status, data, postUrn };
}

// Get token from request header OR database
export async function getTokenOrDB(req) {
  const auth = req.headers.authorization;
  const headerToken = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (headerToken) return headerToken;
  try {
    const { rows } = await query("SELECT config_value FROM api_config WHERE config_key = 'linkedin_access_token'");
    return rows[0]?.config_value || null;
  } catch { return null; }
}

// Escape LinkedIn "Little Text Format" reserved characters
export function escapeLittleText(text) {
  if (!text) return text;
  return text.replace(/([\\|{}@\[\]()<>*_~])/g, "\\$1");
}

export const PROXY_VERSION = "2026-06-17-vercel";
