'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAccess } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getAccess() ? '/gallery' : '/login');
  }, [router]);
  return null;
}
