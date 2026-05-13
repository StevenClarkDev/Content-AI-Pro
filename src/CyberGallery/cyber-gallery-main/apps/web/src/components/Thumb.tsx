'use client';
import { useEffect, useState } from 'react';
import type { AssetDto } from '@cg/shared';
import { authedBlobUrl } from '@/lib/api';

export function Thumb({ asset, onClick }: { asset: AssetDto; onClick?: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    let current: string | null = null;
    if (asset.thumbnailUrl) {
      authedBlobUrl(asset.thumbnailUrl.replace('/api', '')).then((u) => {
        if (revoked) URL.revokeObjectURL(u);
        else { current = u; setUrl(u); }
      }).catch(() => {});
    }
    return () => {
      revoked = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [asset.thumbnailUrl]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="aspect-square bg-neutral-900 overflow-hidden rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={asset.filename}
             className="w-full h-full object-cover hover:opacity-90 transition" />
      ) : (
        <div className="w-full h-full animate-pulse bg-neutral-800" />
      )}
    </button>
  );
}
