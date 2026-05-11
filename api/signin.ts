import { createHmac, scryptSync, timingSafeEqual } from "crypto";
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

type SigninBody = {
  email?: unknown;
  password?: unknown;
};

type DbUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  password_hash: string;
};

type AuthUser = Omit<DbUser, "password_hash">;

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

function parseBody(body: unknown): SigninBody {
  if (typeof body === "string") {
    return JSON.parse(body || "{}") as SigninBody;
  }
  return (body || {}) as SigninBody;
}

function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;

  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = parseBody(req.body);
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const sql = getSql();
    if (!sql) return res.status(500).json({ error: "DATABASE_URL is not configured." });

    const rows = (await sql`
      SELECT id, name, email, phone, password_hash
      FROM app_users
      WHERE email = ${email}
      LIMIT 1
    `) as DbUser[];
    const user = rows[0];

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    return res.status(200).json({
      token: createAuthToken(user),
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Signin failed", error);
    return res.status(500).json({ error: "Could not sign in. Please try again." });
  }
}
