import { randomUUID } from "crypto";
import {
  createAuthToken,
  ensureAuthSchema,
  getSql,
  hashPassword,
  normalizeEmail,
  publicUser,
  validatePassword,
} from "./authUtils.js";

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
  dummyStripePaymentSucceeded?: unknown;
  stripePaymentMethodId?: unknown;
  cardLast4?: unknown;
};

type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
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
    const stripePaymentMethodId = typeof body.stripePaymentMethodId === "string" ? body.stripePaymentMethodId : "";
    const cardLast4 = typeof body.cardLast4 === "string" ? body.cardLast4 : "";
    const paymentSucceeded = body.dummyStripePaymentSucceeded === true && stripePaymentMethodId.startsWith("pm_dummy_");

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    if (!validatePassword(password)) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }
    if (!paymentSucceeded) {
      return res.status(402).json({ error: "A successful $29/month subscription payment is required before creating an account." });
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
    const subscriptionId = `sub_dummy_${randomUUID()}`;
    const customerId = `cus_dummy_${randomUUID()}`;

    await sql`
      INSERT INTO app_users (
        id,
        name,
        email,
        phone,
        password_hash,
        subscription_status,
        stripe_customer_id,
        stripe_subscription_id
      )
      VALUES (
        ${user.id},
        ${user.name},
        ${user.email},
        ${user.phone},
        ${hashPassword(password)},
        'active',
        ${customerId},
        ${subscriptionId}
      )
    `;

    return res.status(201).json({
      token: createAuthToken(user),
      user: publicUser(user),
      subscription: {
        status: "active",
        plan: "Content AI Pro Monthly",
        amount: 29,
        currency: "usd",
        interval: "month",
        cardLast4,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
      },
    });
  } catch (error) {
    console.error("Signup failed", error);
    return res.status(500).json({ error: "Could not create account. Please try again." });
  }
}
