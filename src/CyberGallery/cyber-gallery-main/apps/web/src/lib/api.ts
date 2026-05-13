'use client';
import type { AuthTokens } from '@cg/shared';

const ACCESS = 'cg.web.access';
const REFRESH = 'cg.web.refresh';

export function setTokens(t: AuthTokens) {
  localStorage.setItem(ACCESS, t.accessToken);
  localStorage.setItem(REFRESH, t.refreshToken);
}
export function getAccess() { return typeof window === 'undefined' ? null : localStorage.getItem(ACCESS); }
export function clearTokens() {
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
}

async function refresh(): Promise<string | null> {
  const rt = localStorage.getItem(REFRESH);
  if (!rt) return null;
  const r = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: rt }),
  });
  if (!r.ok) { clearTokens(); return null; }
  const t = (await r.json()) as AuthTokens;
  setTokens(t);
  return t.accessToken;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const access = getAccess();
  const headers = new Headers(init.headers || {});
  if (access) headers.set('Authorization', `Bearer ${access}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (res.status === 401 && retry) {
    const a = await refresh();
    if (a) return api<T>(path, init, false);
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** Build a fetcher that includes Bearer token, used for <img> via blob URLs. */
export async function authedBlobUrl(path: string): Promise<string> {
  const access = getAccess();
  const r = await fetch(`/api${path}`, {
    headers: access ? { Authorization: `Bearer ${access}` } : {},
  });
  if (!r.ok) throw new Error(`img ${r.status}`);
  return URL.createObjectURL(await r.blob());
}
