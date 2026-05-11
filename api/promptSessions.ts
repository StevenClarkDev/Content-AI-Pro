import { randomUUID } from "crypto";
import { neon } from "@neondatabase/serverless";

type SqlClient = ReturnType<typeof neon>;

export type PromptSessionInput = {
  source?: string | null;
  tool?: string | null;
  platform?: string | null;
  tone?: string | null;
  keyword?: string | null;
  prompt: string;
  output?: string | null;
  model?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
};

export type PromptSessionSaveResult =
  | { stored: true; id: string }
  | { stored: false; reason: string };

export type PromptSessionListResult =
  | { stored: true; sessions: unknown[] }
  | { stored: false; sessions: [] };

let sqlClient: SqlClient | null = null;
let schemaReady = false;

function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!sqlClient) {
    sqlClient = neon(process.env.DATABASE_URL);
  }
  return sqlClient;
}

async function ensureSchema(sql: SqlClient) {
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
      user_agent TEXT,
      user_id TEXT,
      user_name TEXT,
      user_email TEXT
    )
  `;

  await sql`ALTER TABLE prompt_sessions ADD COLUMN IF NOT EXISTS user_id TEXT`;
  await sql`ALTER TABLE prompt_sessions ADD COLUMN IF NOT EXISTS user_name TEXT`;
  await sql`ALTER TABLE prompt_sessions ADD COLUMN IF NOT EXISTS user_email TEXT`;

  await sql`
    CREATE INDEX IF NOT EXISTS prompt_sessions_created_at_idx
    ON prompt_sessions (created_at DESC)
  `;

  schemaReady = true;
}

export async function savePromptSession(session: PromptSessionInput): Promise<PromptSessionSaveResult> {
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
      user_agent,
      user_id,
      user_name,
      user_email
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
      ${session.userAgent || null},
      ${session.userId || null},
      ${session.userName || null},
      ${session.userEmail || null}
    )
  `;

  return { stored: true, id };
}

export async function listPromptSessions(limit: unknown = 50): Promise<PromptSessionListResult> {
  const sql = getSql();
  if (!sql) {
    return { stored: false, sessions: [] };
  }

  await ensureSchema(sql);

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const sessions = (await sql`
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
      user_agent,
      user_id,
      user_name,
      user_email
    FROM prompt_sessions
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `) as unknown[];

  return { stored: true, sessions };
}
