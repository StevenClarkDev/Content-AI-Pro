import { randomUUID } from "crypto";
import {
  createAuthToken,
  ensureAuthSchema,
  findUserByEmail,
  getSql,
  hashPassword,
  normalizeEmail,
  publicUser,
  validatePassword,
} from "./authUtils";
import type { ApiRequest, ApiResponse } from "./httpTypes";

type SignupBody = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  password?: unknown;
};

function setCorsHeaders(req: ApiRequest, res: ApiResponse) {
  const origin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function parseBody(body: unknown): SignupBody {
  if (typeof body === "string") {
    return JSON.parse(body || "{}") as SignupBody;
  }
  return (body || {}) as SignupBody;
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
    if (!validatePassword(password)) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const sql = getSql();
    if (!sql) return res.status(500).json({ error: "DATABASE_URL is not configured." });
    await ensureAuthSchema(sql);

    const existing = await findUserByEmail(email);
    if (existing) {
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
