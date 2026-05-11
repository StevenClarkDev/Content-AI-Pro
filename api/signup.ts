import { createHmac, randomBytes, randomUUID, scryptSync } from "crypto";
import { neon } from "@neondatabase/serverless";

type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type ApiResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): ApiResponse;
  end(): ApiResponse;
};

type SignupBody = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  password?: unknown;
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

let sqlClient: ReturnType<typeof neon> | null = null;

function setCorsHeaders(req: ApiRequest, res: ApiResponse) {
  const origin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!sqlClient) sqlClient = neon(process.env.DATABASE_URL);
  return sqlClient;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function parseBody(body: unknown): SignupBody {
  if (typeof body === "string") {
    return JSON.parse(body || "{}") as SignupBody;
  }
  return (body || {}) as SignupBody;
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return `${salt}:${hash}`;
}

function publicUser(user: AuthUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
  };
}

function createAuthToken(user: AuthUser) {
  const secret = process.env.AUTH_SECRET || process.env.SESSION_ADMIN_TOKEN || "";
  if (!secret) throw new Error("AUTH_SECRET is not configured.");

  const payload = {
    sub: user.id,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");

  return `${encodedPayload}.${signature}`;
}

async function ensureAuthSchema(sql: ReturnType<typeof neon>) {
  await sql`
    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS app_users_email_idx ON app_users (email)`;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = parseBody(req.body);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: "Name, email, phone number, and password are required." });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const sql = getSql();
    if (!sql) return res.status(500).json({ error: "DATABASE_URL is not configured." });
    await ensureAuthSchema(sql);

    const existing = (await sql`SELECT id FROM app_users WHERE email = ${email} LIMIT 1`) as unknown[];
    if (existing.length) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const user = {
      id: randomUUID(),
      name,
      email,
      phone,
    };

    await sql`
      INSERT INTO app_users (id, name, email, phone, password_hash)
      VALUES (${user.id}, ${user.name}, ${user.email}, ${user.phone}, ${hashPassword(password)})
    `;

    return res.status(201).json({
      token: createAuthToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Signup failed", error);
    return res.status(500).json({ error: "Could not create account. Please try again." });
  }
}
