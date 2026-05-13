'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getAccess, clearTokens } from '@/lib/api';
import type { AssetDto, DeviceDto, PaginatedAssets } from '@cg/shared';
import { Thumb } from '@/components/Thumb';
import { Lightbox } from '@/components/Lightbox';

export default function GalleryPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [deviceId, setDeviceId] = useState<string | undefined>();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!getAccess()) router.replace('/login');
  }, [router]);

  const devicesQ = useQuery({
    queryKey: ['devices'],
    queryFn: () => api<DeviceDto[]>('/devices'),
  });

  const assetsQ = useInfiniteQuery({
    queryKey: ['assets', deviceId ?? 'all'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<PaginatedAssets>(
        `/assets?limit=60${deviceId ? `&deviceId=${deviceId}` : ''}${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const items: AssetDto[] = assetsQ.data?.pages.flatMap((p) => p.items) ?? [];

  const handleDelete = async (asset: AssetDto) => {
    await api(`/assets/${asset.id}`, { method: 'DELETE' });
    await qc.invalidateQueries({ queryKey: ['assets'] });
    // Adjust open index after deletion
    setOpenIndex((cur) => {
      if (cur == null) return cur;
      const newLen = items.length - 1;
      if (newLen <= 0) return null;
      return Math.min(cur, newLen - 1);
    });
  };

  return (
    <main className="min-h-screen p-4">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Gallery</h1>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/devices" className="opacity-80 hover:opacity-100">Devices</Link>
          <button
            onClick={() => { clearTokens(); router.replace('/login'); }}
            className="opacity-80 hover:opacity-100"
          >
            Logout
          </button>
        </nav>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        <DeviceChip active={!deviceId} label="All" onClick={() => setDeviceId(undefined)} />
        {devicesQ.data?.map((d) => (
          <DeviceChip key={d.id} active={deviceId === d.id} label={d.name}
                      onClick={() => setDeviceId(d.id)} />
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {items.map((a, i) => (
          <Thumb key={a.id} asset={a} onClick={() => setOpenIndex(i)} />
        ))}
      </div>

      <div className="my-6 text-center">
        {assetsQ.hasNextPage && (
          <button onClick={() => assetsQ.fetchNextPage()}
                  disabled={assetsQ.isFetchingNextPage}
                  className="px-4 py-2 bg-neutral-800 rounded">
            {assetsQ.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        )}
        {!assetsQ.hasNextPage && items.length > 0 && (
          <p className="text-neutral-500 text-sm">— end —</p>
        )}
        {!assetsQ.isLoading && items.length === 0 && (
          <p className="text-neutral-500">No photos yet. Sync from your device.</p>
        )}
      </div>

      {openIndex !== null && items[openIndex] && (
        <Lightbox
          items={items}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onIndexChange={setOpenIndex}
          onDelete={handleDelete}
        />
      )}
    </main>
  );
}

function DeviceChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
            className={`px-3 py-1 rounded-full text-sm ${active ? 'bg-indigo-600' : 'bg-neutral-800 hover:bg-neutral-700'}`}>
      {label}
    </button>
  );
}
