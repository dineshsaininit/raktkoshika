import type { DB, Role } from '../data/types';

/**
 * Talks to the Raktkoshika server (server/). Turned on by setting VITE_API_URL, e.g. in .env.local:
 *   VITE_API_URL=http://localhost:4000
 * Without it the app stays a browser-only demo on localStorage.
 */
export const API_URL = String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
export const apiMode = API_URL.length > 0;

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

let current: Role | null = null;
const key = (r: Role) => `raktkoshika-token-${r}`;
const read = (r: Role) => { try { return localStorage.getItem(key(r)); } catch { return null; } };
const write = (r: Role, t: string | null) => { try { if (t) localStorage.setItem(key(r), t); else localStorage.removeItem(key(r)); } catch { /* private mode */ } };

export const currentRole = () => current;
export const token = () => (current ? read(current) : null);

async function raw<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = auth ? token() : null;
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(`${API_URL}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText, data.details);
  return data as T;
}

/** Calls the API as the current portal's account, signing in again once if the session has expired. */
export async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  try { return await raw<T>(method, path, body); } catch (e) {
    if (e instanceof ApiError && e.status === 401 && current) {
      write(current, null);
      await ensureSession(current);
      return raw<T>(method, path, body);
    }
    throw e;
  }
}

/**
 * The portal picker on /login has no password step yet, so each portal signs in as its sample account
 * (server DEMO_LOGIN). Replace this with `login()` once a real sign-in screen exists.
 */
export async function ensureSession(role: Role) {
  current = role;
  if (read(role)) return;
  const r = await raw<{ token: string }>('POST', '/auth/demo', { role }, false);
  write(role, r.token);
}

export async function login(role: Role, phone: string, password: string) {
  const r = await raw<{ token: string; user: { role: Role } }>('POST', '/auth/login', { phone, password }, false);
  write(r.user.role, r.token);
  current = r.user.role;
  if (r.user.role !== role) throw new ApiError(403, `This number belongs to a ${r.user.role} account`);
  return r.user;
}

export function logout(role: Role) { write(role, null); if (current === role) current = null; }

export const fetchDb = () => call<DB>('GET', '/db');

/** Opens the server's change feed; `onChange` fires after any write by anyone. Returns a close function. */
export function subscribe(onChange: () => void) {
  const t = token();
  if (!t) return () => {};
  const es = new EventSource(`${API_URL}/api/events?token=${encodeURIComponent(t)}`);
  es.addEventListener('change', onChange);
  return () => es.close();
}
