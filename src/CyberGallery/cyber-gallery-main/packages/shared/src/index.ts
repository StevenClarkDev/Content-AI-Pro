export const ALLOWED_IMAGE_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export const QUOTA_BYTES_PER_USER = 5 * 1024 * 1024 * 1024; // 5 GB
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;            // 50 MB / image
export const PRESIGN_BATCH_LIMIT = 50;

export type AssetStatus = 'pending' | 'uploaded' | 'failed' | 'deleted';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UserDto {
  id: string;
  email: string;
}

export interface DeviceDto {
  id: string;
  platform: 'android' | 'ios';
  deviceUid: string;
  name: string;
  lastSyncAt: string | null;
}

export interface AssetDto {
  id: string;
  deviceId: string;
  deviceAssetId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  takenAt: string | null;
  status: AssetStatus;
  uploadedAt: string | null;
  thumbnailUrl: string | null;
  originalUrl: string | null;
}

/* ---------- sync diff ---------- */
export interface DiffItem {
  deviceAssetId: string;
  checksum: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  takenAt?: string | null;
  modifiedAt?: string | null;
}

export interface DiffResultEntry {
  deviceAssetId: string;
  assetId: string;
  uploadUrl: string;       // local upload endpoint (token-bound)
  uploadToken: string;
}

export interface DiffResponse {
  toUpload: DiffResultEntry[];
  upToDate: string[];      // deviceAssetIds
  quotaUsedBytes: number;
  quotaTotalBytes: number;
}

export interface CompleteUploadDto {
  checksum: string;
  sizeBytes: number;
}

export interface PaginatedAssets {
  items: AssetDto[];
  nextCursor: string | null;
}
