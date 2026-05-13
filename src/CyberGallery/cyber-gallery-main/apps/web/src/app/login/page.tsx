'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setTokens } from '@/lib/api';
import type { AuthTokens } from '@cg/shared';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (mode: 'login' | 'register') => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      if (!r.ok) throw new Error(await r.text());
      const t = (await r.json()) as AuthTokens;
      setTokens(t);
      router.replace('/gallery');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 bg-neutral-900 p-6 rounded-xl">
        <h1 className="text-2xl font-semibold">Cyber Gallery</h1>
        <input className="w-full p-3 rounded bg-neutral-800" placeholder="email"
               value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full p-3 rounded bg-neutral-800" placeholder="password" type="password"
               value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <p className="text-red-400 text-sm">{err}</p>}
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => submit('login')}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 rounded p-3">
            Login
          </button>
          <button disabled={busy} onClick={() => submit('register')}
                  className="flex-1 bg-neutral-700 hover:bg-neutral-600 rounded p-3">
            Register
          </button>
        </div>
      </div>
    </main>
  );
}
