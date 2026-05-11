import {
  createAuthToken,
  findUserByEmail,
  normalizeEmail,
  publicUser,
  verifyPassword,
} from "./authUtils";
import type { ApiRequest, ApiResponse } from "./httpTypes";

type SigninBody = {
  email?: unknown;
  password?: unknown;
};

function setCorsHeaders(req: ApiRequest, res: ApiResponse) {
  const origin = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function parseBody(body: unknown): SigninBody {
  if (typeof body === "string") {
    return JSON.parse(body || "{}") as SigninBody;
  }
  return (body || {}) as SigninBody;
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

    const user = await findUserByEmail(email);
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
