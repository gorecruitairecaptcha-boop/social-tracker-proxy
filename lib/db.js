import pg from "pg";

let pool;

export function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      // On serverless, prefer a TRANSACTION-MODE pooled connection string
      // (PgBouncer / Neon pooled endpoint / Supabase port 6543) if you have one.
      connectionString:
        process.env.POSTGRES_URL_POOLED ||
        process.env.POSTGRES_URL ||
        process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      // Serverless-safe pool: each warm instance keeps at most ONE connection, so many
      // concurrent Vercel instances can't exhaust the database's connection limit — that
      // exhaustion was the root cause of the intermittent 500/503 errors.
      max: Number(process.env.PG_POOL_MAX) || 1,
      idleTimeoutMillis: 10000,       // release idle connections quickly
      connectionTimeoutMillis: 10000, // fail fast instead of hanging the whole function
      allowExitOnIdle: true,          // let the instance freeze cleanly between invocations
      keepAlive: true,
    });

    // CRITICAL: without this listener, an error on an *idle* client (e.g. the database
    // dropping a connection once its limit is reached) is thrown at the process level and
    // crashes the serverless function. Vercel then returns a 500/503 with NO CORS headers,
    // which the app reports as "Cannot reach proxy server". Handling it here keeps the
    // function alive and lets requests return proper (CORS-enabled) JSON responses.
    pool.on("error", (err) => {
      console.error("pg idle client error (handled):", err.message);
    });
  }
  return pool;
}

export async function query(text, params) {
  try {
    return await getPool().query(text, params);
  } catch (err) {
    // Retry once on transient connection errors (stale pooled connection, limit hit, reset).
    const transient = /Connection terminated|ECONNRESET|too many clients|timeout|server closed|Client has encountered a connection error/i.test(
      err.message || ""
    );
    if (transient) {
      return await getPool().query(text, params);
    }
    throw err;
  }
}

// LinkedIn fetch helper
export async function liFetch(url, token, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  const fetchOpts = {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": "202604",
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal || controller.signal,
  };
  try {
    const res = await fetch(url, fetchOpts);
    clearTimeout(timeout);
    const text2 = await res.text();
    let data;
    try { data = JSON.parse(text2); } catch { data = { raw: text2 }; }
    const postUrn = res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id") || null;
    return { error: !res.ok, status: res.status, data, postUrn };
  } catch (e) {
    clearTimeout(timeout);
    return { error: true, status: 504, data: { message: e.name === "AbortError" ? "LinkedIn API timed out — token may be expired" : e.message } };
  }
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

export const PROXY_VERSION = "2026-06-25-parallel-sync";
