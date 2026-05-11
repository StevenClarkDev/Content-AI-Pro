import { listPromptSessions } from "./promptSessions.js";
import type { ApiRequest, ApiResponse } from "./httpTypes.js";

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function setCorsHeaders(req: ApiRequest, res: ApiResponse) {
  const origin = firstHeader(req.headers.origin) || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const adminToken = process.env.SESSION_ADMIN_TOKEN;
  if (!adminToken) {
    return res.status(503).json({ error: "Session admin access is not configured." });
  }

  const authHeader = firstHeader(req.headers.authorization) || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token !== adminToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await listPromptSessions(req.query?.limit);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Failed to list prompt sessions", error);
    return res.status(500).json({ error: "Could not load prompt sessions." });
  }
}
