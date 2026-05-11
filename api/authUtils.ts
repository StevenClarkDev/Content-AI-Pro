import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "crypto";
import { neon } from "@neondatabase/serverless";
import type { ApiRequest, HeaderValue } from "./httpTypes";

type SqlClient = ReturnType<typeof neon>;

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

type DbUser = AuthUser & {
  password_hash: string;
};

type TokenPayload = {
  sub: string;
  email: string;
  exp: number;
};

let sqlClient: SqlClient | null = null;
let authSchemaReady = false;

export function firstHeader(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!sqlClient) {
    sqlClient = neon(process.env.DATABASE_URL);
  }
  return sqlClient;
}

export async function ensureAuthSchema(sql: SqlClient) {
  if (authSchemaReady) return;

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

  await sql`
    CREATE INDEX IF NOT EXISTS app_users_email_idx
    ON app_users (email)
  `;

  authSchemaReady = true;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function validatePassword(password: string) {
  return password.length >= 8;
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;

  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}

function getAuthSecret() {
  return process.env.AUTH_SECRET || process.env.SESSION_ADMIN_TOKEN || "";
}

function toBase64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export function createAuthToken(user: AuthUser) {
  const secret = getAuthSecret();
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured.");
  }

  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");

  return `${encodedPayload}.${signature}`;
}

export function verifyAuthToken(token: string): TokenPayload | null {
  const secret = getAuthSecret();
  if (!secret) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as TokenPayload;
    if (!payload.sub || !payload.email || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function findUserByEmail(email: string): Promise<DbUser | null> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is not configured.");
  await ensureAuthSchema(sql);

  const rows = (await sql`
    SELECT id, name, email, phone, password_hash
    FROM app_users
    WHERE email = ${normalizeEmail(email)}
    LIMIT 1
  `) as DbUser[];

  return rows[0] || null;
}

export async function findUserById(id: string): Promise<AuthUser | null> {
  const sql = getSql();
  if (!sql) throw new Error("DATABASE_URL is not configured.");
  await ensureAuthSchema(sql);

  const rows = (await sql`
    SELECT id, name, email, phone
    FROM app_users
    WHERE id = ${id}
    LIMIT 1
  `) as AuthUser[];

  return rows[0] || null;
}

export async function getAuthenticatedUser(req: ApiRequest): Promise<AuthUser | null> {
  const authHeader = firstHeader(req.headers.authorization) || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;

  const payload = verifyAuthToken(token);
  if (!payload) return null;

  return findUserById(payload.sub);
}

export function publicUser(user: AuthUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
  };
}
