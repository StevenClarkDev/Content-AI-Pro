'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DeviceDto } from '@cg/shared';

export default function DevicesPage() {
  const q = useQuery({ queryKey: ['devices'], queryFn: () => api<DeviceDto[]>('/devices') });
  return (
    <main className="min-h-screen p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Devices</h1>
        <Link href="/gallery" className="text-sm opacity-80 hover:opacity-100">← Gallery</Link>
      </header>
      <ul className="space-y-2">
        {q.data?.map((d) => (
          <li key={d.id} className="bg-neutral-900 p-4 rounded flex justify-between">
            <div>
              <div className="font-semibold">{d.name}</div>
              <div className="text-sm text-neutral-400">{d.platform} · {d.deviceUid}</div>
            </div>
            <div className="text-sm text-neutral-400">
              Last sync: {d.lastSyncAt ? new Date(d.lastSyncAt).toLocaleString() : '—'}
            </div>
          </li>
        ))}
        {q.data?.length === 0 && <p className="text-neutral-500">No devices registered.</p>}
      </ul>
    </main>
  );
}
