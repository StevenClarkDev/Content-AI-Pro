import { CameraRoll, PhotoIdentifier } from '@react-native-camera-roll/camera-roll';
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';
import { PermissionsAndroid } from 'react-native';

export interface LocalAsset {
  deviceAssetId: string;
  uri: string;          // file:// or content:// (we resolve to local path)
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  takenAt?: string;
  modifiedAt?: string;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

function mimeFromName(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext ? MIME_BY_EXT[ext] ?? null : null;
}

export async function ensureGalleryPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const sdk = Platform.Version as number;
  if (sdk >= 33) {
    const res = await PermissionsAndroid.request(
      // @ts-ignore — present on Android 13+
      'android.permission.READ_MEDIA_IMAGES',
    );
    return res === PermissionsAndroid.RESULTS.GRANTED;
  }
  const res = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
  );
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

function toLocalAsset(p: PhotoIdentifier): LocalAsset | null {
  const node = p.node;
  const filename = node.image.filename || `${node.image.uri.split('/').pop()}`;
  // CameraRoll's node.type is often 'image' (no subtype) on Android — that
  // breaks multer's file detection. Always derive a full image/* MIME.
  let mime = node.type && node.type.includes('/') ? node.type : null;
  if (!mime) mime = mimeFromName(filename || '') || 'image/jpeg';
  if (!mime.startsWith('image/')) return null;
  return {
    deviceAssetId: node.id ?? node.image.uri, // RN id, fallback to uri
    uri: node.image.uri,
    filename: filename || 'photo.jpg',
    mimeType: mime,
    sizeBytes: node.image.fileSize ?? 0,
    width: node.image.width,
    height: node.image.height,
    takenAt: node.timestamp ? new Date(node.timestamp * 1000).toISOString() : undefined,
    modifiedAt: node.modificationTimestamp
      ? new Date(node.modificationTimestamp * 1000).toISOString()
      : undefined,
  };
}

export async function* enumerateGallery(pageSize = 2000): AsyncGenerator<LocalAsset[]> {
  let after: string | undefined;
  while (true) {
    const page = await CameraRoll.getPhotos({
      first: pageSize,
      after,
      assetType: 'Photos',
      include: ['filename', 'fileSize', 'imageSize', 'playableDuration'],
    });
    const batch = page.edges
      .map(toLocalAsset)
      .filter(Boolean) as LocalAsset[];
    if (batch.length) yield batch;
    if (!page.page_info.has_next_page) return;
    after = page.page_info.end_cursor;
  }
}

/** Resolve a content:// or ph:// uri to a readable file path; returns local path. */
export async function resolveLocalPath(uri: string, filename: string): Promise<string> {
  if (uri.startsWith('file://')) return uri.replace('file://', '');
  // copy into cache so we can read & hash deterministically
  const dest = `${RNFS.CachesDirectoryPath}/cg-upload-${Date.now()}-${filename}`;
  await RNFS.copyFile(uri, dest);
  return dest;
}
