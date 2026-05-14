import { randomUUID } from "crypto";
import type { ApiRequest, ApiResponse } from "./httpTypes.js";
import { getAuthenticatedUser, getSql } from "./authUtils.js";

type GalleryAsset = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  data_url: string;
  source: string;
  created_at: string;
};

type UploadBody = {
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  dataUrl?: string;
  source?: string;
  originalMimeType?: string;
  originalSizeBytes?: number;
};

let gallerySchemaReady = false;

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
      source TEXT NOT NULL DEFAULT 'portal'
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS cyber_gallery_assets_user_created_idx
    ON cyber_gallery_assets (user_id, created_at DESC)
  `;

  gallerySchemaReady = true;
}

function parseBody(body: unknown): UploadBody {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as UploadBody;
    } catch {
      return {};
    }
  }
  return body as UploadBody;
}

function logGalleryUpload(event: string, details: Record<string, unknown>) {
  console.info(`[gallery-upload] ${event}`, {
    ...details,
    timestamp: new Date().toISOString(),
  });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const sql = getSql();
  if (!sql) {
    return jsonError(res, 500, "DATABASE_URL is not configured.");
  }

  const user = await getAuthenticatedUser(req);
  if (!user) {
    if (req.method === "POST") {
      logGalleryUpload("unauthorized", {
        source: "unknown",
        contentLength: req.headers["content-length"] || null,
      });
    }
    return jsonError(res, 401, "Please sign in first.");
  }

  await ensureGallerySchema(sql);

  if (req.method === "GET") {
    const rows = (await sql`
      SELECT id, file_name, mime_type, size_bytes, data_url, source, created_at
      FROM cyber_gallery_assets
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
      LIMIT 120
    `) as GalleryAsset[];

    return res.status(200).json({ assets: rows });
  }

  if (req.method === "DELETE") {
    const id = typeof req.query?.id === "string" ? req.query.id : "";
    if (!id) {
      return jsonError(res, 400, "Asset id is required.");
    }

    await sql`
      DELETE FROM cyber_gallery_assets
      WHERE id = ${id} AND user_id = ${user.id}
    `;

    return res.status(200).json({ ok: true });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET,POST,DELETE,OPTIONS");
    return jsonError(res, 405, "Method not allowed.");
  }

  const body = parseBody(req.body);
  const fileName = (body.fileName || "gallery-image").trim().slice(0, 160);
  const mimeType = (body.mimeType || "").trim();
  const sizeBytes = Number(body.sizeBytes || 0);
  const dataUrl = body.dataUrl || "";
  const source = (body.source || "portal").trim().slice(0, 40);
  const originalMimeType = (body.originalMimeType || "").trim();
  const originalSizeBytes = Number(body.originalSizeBytes || 0);

  logGalleryUpload("attempt", {
    userId: user.id,
    userEmail: user.email,
    fileName,
    mimeType,
    sizeBytes,
    source,
    originalMimeType: originalMimeType || null,
    originalSizeBytes: originalSizeBytes || null,
    contentLength: req.headers["content-length"] || null,
    hasDataUrl: Boolean(dataUrl),
  });

  if (!mimeType.startsWith("image/") || !dataUrl.startsWith("data:image/")) {
    logGalleryUpload("rejected-invalid-image", {
      userId: user.id,
      userEmail: user.email,
      fileName,
      mimeType,
      source,
      dataUrlPrefix: dataUrl.slice(0, 24),
    });
    return jsonError(res, 400, "Please upload a valid image.");
  }

  if (!sizeBytes || sizeBytes > 2 * 1024 * 1024) {
    logGalleryUpload("rejected-size", {
      userId: user.id,
      userEmail: user.email,
      fileName,
      sizeBytes,
      source,
    });
    return jsonError(res, 400, "Please upload an image under 2 MB.");
  }

  const id = randomUUID();
  const rows = (await sql`
    INSERT INTO cyber_gallery_assets (
      id, user_id, user_name, user_email, file_name, mime_type, size_bytes, data_url, source
    )
    VALUES (
      ${id}, ${user.id}, ${user.name}, ${user.email}, ${fileName}, ${mimeType}, ${sizeBytes}, ${dataUrl}, ${source}
    )
    RETURNING id, file_name, mime_type, size_bytes, data_url, source, created_at
  `) as GalleryAsset[];

  logGalleryUpload("stored", {
    userId: user.id,
    userEmail: user.email,
    assetId: rows[0]?.id || id,
    fileName,
    mimeType,
    sizeBytes,
    source,
  });

  return res.status(201).json({ asset: rows[0] });
}
