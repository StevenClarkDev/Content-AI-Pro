const { randomUUID } = require("crypto");
const { neon } = require("@neondatabase/serverless");

let sqlClient = null;
let schemaReady = false;

function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!sqlClient) {
    sqlClient = neon(process.env.DATABASE_URL);
  }
  return sqlClient;
}

async function ensureSchema(sql) {
  if (schemaReady) return;

  await sql`
    CREATE TABLE IF NOT EXISTS prompt_sessions (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source TEXT NOT NULL DEFAULT 'portal',
      tool TEXT,
      platform TEXT,
      tone TEXT,
      keyword TEXT,
      prompt TEXT NOT NULL,
      output TEXT,
      model TEXT,
      ip_address TEXT,
      user_agent TEXT
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS prompt_sessions_created_at_idx
    ON prompt_sessions (created_at DESC)
  `;

  schemaReady = true;
}

async function savePromptSession(session) {
  const sql = getSql();
  if (!sql) {
    return { stored: false, reason: "DATABASE_URL is not configured." };
  }

  await ensureSchema(sql);

  const id = randomUUID();
  await sql`
    INSERT INTO prompt_sessions (
      id,
      source,
      tool,
      platform,
      tone,
      keyword,
      prompt,
      output,
      model,
      ip_address,
      user_agent
    )
    VALUES (
      ${id},
      ${session.source || "portal"},
      ${session.tool || null},
      ${session.platform || null},
      ${session.tone || null},
      ${session.keyword || null},
      ${session.prompt},
      ${session.output || null},
      ${session.model || null},
      ${session.ipAddress || null},
      ${session.userAgent || null}
    )
  `;

  return { stored: true, id };
}

async function listPromptSessions(limit = 50) {
  const sql = getSql();
  if (!sql) {
    return { stored: false, sessions: [] };
  }

  await ensureSchema(sql);

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const sessions = await sql`
    SELECT
      id,
      created_at,
      source,
      tool,
      platform,
      tone,
      keyword,
      prompt,
      output,
      model,
      ip_address,
      user_agent
    FROM prompt_sessions
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;

  return { stored: true, sessions };
}

module.exports = {
  listPromptSessions,
  savePromptSession,
};
