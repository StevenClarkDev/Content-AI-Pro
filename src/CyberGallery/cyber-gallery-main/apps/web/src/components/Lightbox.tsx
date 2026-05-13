'use client';
import { useEffect, useState } from 'react';
import type { AssetDto } from '@cg/shared';
import { authedBlobUrl } from '@/lib/api';

interface Props {
  items: AssetDto[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  onDelete: (asset: AssetDto) => Promise<void> | void;
}

export function Lightbox({ items, index, onClose, onIndexChange, onDelete }: Props) {
  const asset = items[index];
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!asset) return;
    let revoked = false;
    let current: string | null = null;
    setLoading(true);
    setUrl(null);
    authedBlobUrl(`/assets/${asset.id}/file?kind=original`)
      .then((u) => {
        if (revoked) URL.revokeObjectURL(u);
        else { current = u; setUrl(u); setLoading(false); }
      })
      .catch(() => setLoading(false));
    return () => {
      revoked = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [asset?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && index < items.length - 1) onIndexChange(index + 1);
      else if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onClose, onIndexChange]);

  if (!asset) return null;

  const handleDelete = async () => {
    if (!confirm(`Delete "${asset.filename}"? This cannot be undone.`)) return;
    setDeleting(true);
    try { await onDelete(asset); } finally { setDeleting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      <header className="flex items-center justify-between p-3 text-sm text-neutral-300">
        <div className="truncate">
          <span className="font-medium text-white">{asset.filename}</span>
          <span className="ml-3 opacity-60">
            {asset.width}×{asset.height} · {formatBytes(asset.sizeBytes)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={url ?? '#'}
            download={asset.filename}
            className={`px-3 py-1 rounded ${url ? 'bg-neutral-800 hover:bg-neutral-700' : 'bg-neutral-900 opacity-50 pointer-events-none'}`}
          >
            Download
          </a>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-1 rounded bg-red-700 hover:bg-red-600 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          <button onClick={onClose}
                  className="px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-700">
            Close
          </button>
        </div>
      </header>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden">
        {index > 0 && (
          <button
            onClick={() => onIndexChange(index - 1)}
            aria-label="Previous"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/40 hover:bg-black/60 text-2xl"
          >‹</button>
        )}

        {loading || !url ? (
          <div className="text-neutral-500">Loading…</div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={asset.filename}
               className="max-w-full max-h-full object-contain" />
        )}

        {index < items.length - 1 && (
          <button
            onClick={() => onIndexChange(index + 1)}
            aria-label="Next"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/40 hover:bg-black/60 text-2xl"
          >›</button>
        )}
      </div>

      <footer className="p-2 text-center text-xs text-neutral-500">
        {index + 1} / {items.length}
      </footer>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
