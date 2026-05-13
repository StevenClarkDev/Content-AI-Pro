import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from './config';
import type { AuthTokens } from '@cg/shared';

const ACCESS_KEY = 'cg.access';
const REFRESH_KEY = 'cg.refresh';

export async function setTokens(t: AuthTokens) {
  await AsyncStorage.multiSet([
    [ACCESS_KEY, t.accessToken],
    [REFRESH_KEY, t.refreshToken],
  ]);
}

export async function clearTokens() {
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
}

export async function getAccess() {
  return AsyncStorage.getItem(ACCESS_KEY);
}

async function refresh(): Promise<string | null> {
  const rt = await AsyncStorage.getItem(REFRESH_KEY);
  if (!rt) return null;
  const r = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: rt }),
  });
  if (!r.ok) {
    await clearTokens();
    return null;
  }
  const tokens = (await r.json()) as AuthTokens;
  await setTokens(tokens);
  return tokens.accessToken;
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const access = await getAccess();
  const headers = new Headers(init.headers || {});
  if (access) headers.set('Authorization', `Bearer ${access}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (res.status === 401 && retry) {
    const newAccess = await refresh();
    if (newAccess) return api<T>(path, init, false);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function login(email: string, password: string) {
  const r = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error('Login failed');
  const t = (await r.json()) as AuthTokens;
  await setTokens(t);
  return t;
}

export async function register(email: string, password: string) {
  const r = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error('Register failed');
  const t = (await r.json()) as AuthTokens;
  await setTokens(t);
  return t;
}
