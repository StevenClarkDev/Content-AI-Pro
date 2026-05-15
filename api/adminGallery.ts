import type { ApiRequest, ApiResponse } from "./httpTypes.js";
import { firstHeader, getSql } from "./authUtils.js";

type AdminGalleryAsset = {
  id: string;
  device_asset_id?: string | null;
  user_id: string;
  user_name: string;
  user_email: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  data_url: string;
  source: string;
  created_at: string;
};

let gallerySchemaReady = false;

function setCorsHeaders(req: ApiRequest, res: ApiResponse) {
  const origin = firstHeader(req.headers.origin) || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function jsonError(res: ApiResponse, status: number, error: string) {
  return res.status(status).json({ error });
}

async function ensureGallerySchema(sql: ReturnType<typeof getSql>) {
  if (!sql || gallerySchemaReady) return;

  await sql`
    CREATE TABLE IF NOT EXISTS cyber_gallery_assets (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      user_name TEXT NOT NULL,
      user_email TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      data_url TEXT NOT NULL,
      device_asset_id TEXT,
      source TEXT NOT NULL DEFAULT 'portal'
    )
  `;

  await sql`ALTER TABLE cyber_gallery_assets ADD COLUMN IF NOT EXISTS device_asset_id TEXT`;

  await sql`
    CREATE INDEX IF NOT EXISTS cyber_gallery_assets_user_created_idx
    ON cyber_gallery_assets (user_id, created_at DESC)
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cyber_gallery_assets_user_device_idx
    ON cyber_gallery_assets (user_id, device_asset_id)
    WHERE device_asset_id IS NOT NULL
  `;

  gallerySchemaReady = true;
}

function isAdmin(req: ApiRequest) {
  const adminToken = process.env.SESSION_ADMIN_TOKEN;
  if (!adminToken) return false;

  const authHeader = firstHeader(req.headers.authorization) || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  return token === adminToken;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (!isAdmin(req)) {
    return jsonError(res, 401, "Unauthorized");
  }

  const sql = getSql();
  if (!sql) {
    return jsonError(res, 500, "DATABASE_URL is not configured.");
  }

  await ensureGallerySchema(sql);

  if (req.method === "GET") {
    const totalRows = (await sql`
      SELECT COUNT(*)::int AS total
      FROM cyber_gallery_assets
    `) as { total: number }[];

    const rows = (await sql`
      SELECT id, device_asset_id, user_id, user_name, user_email, file_name, mime_type, size_bytes, data_url, source, created_at
      FROM cyber_gallery_assets
      ORDER BY created_at DESC
      LIMIT 240
    `) as AdminGalleryAsset[];

    return res.status(200).json({ assets: rows, total: totalRows[0]?.total || rows.length });
  }

  if (req.method === "DELETE") {
    const id = typeof req.query?.id === "string" ? req.query.id : "";
    if (!id) {
      return jsonError(res, 400, "Asset id is required.");
    }

    await sql`
      DELETE FROM cyber_gallery_assets
      WHERE id = ${id}
    `;

    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET,DELETE,OPTIONS");
  return jsonError(res, 405, "Method not allowed.");
}
