import { createHmac, timingSafeEqual } from "crypto";
import { neon } from "@neondatabase/serverless";

type ApiRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): ApiResponse;
  end(): ApiResponse;
};

type TokenPayload = {
  sub: string;
  email: string;
  exp: number;
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
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function firstHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!sqlClient) sqlClient = neon(process.env.DATABASE_URL);
  return sqlClient;
}

function verifyAuthToken(token: string): TokenPayload | null {
  const secret = process.env.AUTH_SECRET || process.env.SESSION_ADMIN_TOKEN || "";
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

function publicUser(user: AuthUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authHeader = firstHeader(req.headers.authorization) || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const payload = token ? verifyAuthToken(token) : null;
    if (!payload) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const sql = getSql();
    if (!sql) return res.status(500).json({ error: "DATABASE_URL is not configured." });

    const rows = (await sql`
      SELECT id, name, email, phone
      FROM app_users
      WHERE id = ${payload.sub}
      LIMIT 1
    `) as AuthUser[];
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    return res.status(200).json({ user: publicUser(user) });
  } catch (error) {
    console.error("Failed to load current user", error);
    return res.status(500).json({ error: "Could not load account." });
  }
}
