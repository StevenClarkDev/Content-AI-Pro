import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, getAccess } from './api';
import { API_BASE_URL } from './config';
import { ensureDevice, getDeviceId } from './device';
import {
  enumerateGallery,
  ensureGalleryPermission,
  resolveLocalPath,
  LocalAsset,
} from './gallery';
import { sha256File } from './hash';
import type { DiffResponse, DiffItem } from '@cg/shared';

const SYNCED_INDEX_KEY = 'cg.syncedIndex'; // map<deviceAssetId, checksum>
const SEEN_INDEX_KEY = 'cg.seenIndex';     // last seen ids (for delete detection)
const DIFF_BATCH = 10000;
const UPLOAD_CONCURRENCY = 3;

type Index = Record<string, string>;

async function loadIndex(key: string): Promise<Index> {
  const raw = await AsyncStorage.getItem(key);
  return raw ? JSON.parse(raw) : {};
}
async function saveIndex(key: string, idx: Index) {
  await AsyncStorage.setItem(key, JSON.stringify(idx));
}

export interface SyncProgress {
  phase: 'idle' | 'scanning' | 'diffing' | 'uploading' | 'deleting' | 'done' | 'error';
  scanned: number;
  toUpload: number;
  uploaded: number;
  failed: number;
  message?: string;
}

export type ProgressCb = (p: SyncProgress) => void;

export class SyncEngine {
  private cancelled = false;
  cancel() { this.cancelled = true; }

  async run(onProgress: ProgressCb) {
    this.cancelled = false;
    const progress: SyncProgress = {
      phase: 'scanning', scanned: 0, toUpload: 0, uploaded: 0, failed: 0,
    };
    onProgress(progress);

    try {
      const granted = await ensureGalleryPermission();
      if (!granted) throw new Error('Gallery permission denied');

      await ensureDevice();
      const deviceId = await getDeviceId();
      if (!deviceId) throw new Error('Device not registered');

      const synced = await loadIndex(SYNCED_INDEX_KEY);
      const seenNow: Index = {};

      for await (const batch of enumerateGallery(200)) {
        if (this.cancelled) break;
        progress.scanned += batch.length;
        onProgress({ ...progress });

        // Build candidates needing diff (skip if already synced & checksum matches by file size cache)
        const candidates: { local: LocalAsset; localPath: string; checksum: string }[] = [];
        for (const a of batch) {
          seenNow[a.deviceAssetId] = synced[a.deviceAssetId] ?? '';
          if (synced[a.deviceAssetId]) continue; // assume unchanged; deep-rehash optional
          try {
            const localPath = await resolveLocalPath(a.uri, a.filename);
            const checksum = await sha256File(localPath);
            if (synced[a.deviceAssetId] === checksum) continue;
            candidates.push({ local: a, localPath, checksum });
          } catch (e) {
            progress.failed++;
          }
        }

        // Diff in chunks
        for (let i = 0; i < candidates.length; i += DIFF_BATCH) {
          if (this.cancelled) break;
          const slice = candidates.slice(i, i + DIFF_BATCH);
          progress.phase = 'diffing';
          onProgress({ ...progress });

          const items: DiffItem[] = slice.map(({ local, checksum }) => ({
            deviceAssetId: local.deviceAssetId,
            checksum,
            filename: local.filename,
            mimeType: local.mimeType,
            sizeBytes: local.sizeBytes,
            width: local.width,
            height: local.height,
            takenAt: local.takenAt ?? null,
            modifiedAt: local.modifiedAt ?? null,
          }));
          const diff = await api<DiffResponse>('/sync/diff', {
            method: 'POST',
            body: JSON.stringify({ deviceId, items }),
          });

          for (const id of diff.upToDate) {
            const c = slice.find((x) => x.local.deviceAssetId === id);
            if (c) synced[id] = c.checksum;
          }

          progress.toUpload += diff.toUpload.length;
          progress.phase = 'uploading';
          onProgress({ ...progress });

          await runPool(diff.toUpload, UPLOAD_CONCURRENCY, async (entry) => {
            if (this.cancelled) return;
            const c = slice.find((x) => x.local.deviceAssetId === entry.deviceAssetId);
            if (!c) return;
            try {
              await uploadOne(entry.assetId, entry.uploadToken, c.localPath, c.local);
              synced[entry.deviceAssetId] = c.checksum;
              progress.uploaded++;
            } catch (e: any) {
              progress.failed++;
              progress.message = e.message;
            } finally {
              onProgress({ ...progress });
            }
          });

          await saveIndex(SYNCED_INDEX_KEY, synced);
        }
      }

      // M4: detect deletions = ids that were in previous "seen" but not in seenNow
      const previouslySeen = await loadIndex(SEEN_INDEX_KEY);
      const removedIds = Object.keys(previouslySeen).filter((id) => !(id in seenNow));
      if (removedIds.length) {
        progress.phase = 'deleting';
        onProgress({ ...progress });
        const deviceId2 = await getDeviceId();
        for (let i = 0; i < removedIds.length; i += 200) {
          await api('/sync/delete', {
            method: 'POST',
            body: JSON.stringify({
              deviceId: deviceId2,
              deviceAssetIds: removedIds.slice(i, i + 200),
            }),
          });
        }
        for (const id of removedIds) delete synced[id];
        await saveIndex(SYNCED_INDEX_KEY, synced);
      }
      await saveIndex(SEEN_INDEX_KEY, seenNow);

      progress.phase = 'done';
      onProgress({ ...progress });
    } catch (e: any) {
      onProgress({ ...progress, phase: 'error', message: e.message });
    }
  }
}

async function uploadOne(
  assetId: string,
  token: string,
  localPath: string,
  meta: LocalAsset,
) {
  const access = await getAccess();
  const safeType = meta.mimeType && meta.mimeType.includes('/')
    ? meta.mimeType
    : 'image/jpeg';
  const url = `${API_BASE_URL}/assets/${assetId}/upload?token=${encodeURIComponent(token)}`;

  // Send raw bytes (avoids RN/okhttp multipart boundary bugs).
  const cleanPath = localPath.replace(/^file:\/\//, '');
  const base64 = await RNFS.readFile(cleanPath, 'base64');
  // @ts-ignore — global.Buffer not standard but RN provides via polyfill from quick-crypto
  const bin = decodeBase64(base64);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': safeType || 'application/octet-stream',
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
    body: bin,
  });
  if (!res.ok) throw new Error(`upload ${res.status}: ${await res.text()}`);
}

function decodeBase64(b64: string): Uint8Array {
  // RN supports atob globally
  // eslint-disable-next-line no-undef
  const bin = global.atob ? global.atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (t: T) => Promise<void>,
) {
  const queue = items.slice();
  const runners = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const next = queue.shift();
      if (!next) return;
      await worker(next);
    }
  });
  await Promise.all(runners);
}
