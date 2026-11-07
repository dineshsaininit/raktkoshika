import type { BloodGroup, DB, Role } from '../data/types';

/**
 * Talks to the Raktkoshika server (server/). Turned on by VITE_API_URL at build time:
 *   VITE_API_URL=http://localhost:4000   frontend and API on different addresses (local development)
 *   VITE_API_URL=same-origin             frontend served by the API server itself (Render)
 * Without it the app is the browser-only demo on localStorage.
 */
const RAW = String(import.meta.env.VITE_API_URL ?? '').trim();
export const apiMode = RAW.length > 0;
// "same-origin" (or "/") means the API is on the same server as the website. Prefer the word: Git Bash on
// Windows rewrites a bare "/" into a Windows path.
const BASE = RAW === 'same-origin' || RAW === '/' ? '' : RAW.replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: { path: string; message: string }[]) { super(message); }
}

export interface SessionUser { id: string; role: Role; name: string; org: string; initials: string; phone: string }

let current: Role | null = null;
const key = (r: Role) => `raktkoshika-token-${r}`;
const read = (r: Role) => { try { return localStorage.getItem(key(r)); } catch { return null; } };
const write = (r: Role, t: string | null) => { try { if (t) localStorage.setItem(key(r), t); else localStorage.removeItem(key(r)); } catch { /* private mode */ } };

export const token = () => (current ? read(current) : null);
export const hasSession = (role: Role) => !!read(role);

/** Thrown when a portal is opened without a session; the shell sends the person to the sign-in page. */
export class SignedOut extends Error { constructor(public role: Role) { super('Signed out'); } }

async function raw<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = auth ? token() : null;
  if (t) headers.Authorization = `Bearer ${t}`;
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const first = Array.isArray(data.details) && data.details[0]?.message;
    throw new ApiError(res.status, first && data.error === 'Invalid input' ? first : data.error ?? res.statusText, data.details);
  }
  return data as T;
}

/** Calls the API as the current portal's account. An expired session sends the person back to sign in. */
export async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  try { return await raw<T>(method, path, body); } catch (e) {
    if (e instanceof ApiError && e.status === 401 && current) {
      const r = current;
      write(r, null);
      throw new SignedOut(r);
    }
    throw e;
  }
}

/** Picks the portal whose saved session the next calls use. */
export function selectSession(role: Role) {
  current = role;
  if (!read(role)) throw new SignedOut(role);
}

export async function login(phone: string, password: string): Promise<SessionUser> {
  const r = await raw<{ token: string; user: SessionUser }>('POST', '/auth/login', { phone, password }, false);
  write(r.user.role, r.token);
  return r.user;
}

export interface Registration { name: string; phone: string; password: string; city: string; group: BloodGroup; sex: 'F' | 'M'; age: number; weight: number }
export async function register(input: Registration): Promise<SessionUser> {
  const r = await raw<{ token: string; user: SessionUser }>('POST', '/auth/register', input, false);
  write('user', r.token);
  return r.user;
}

export function logout(role: Role) { write(role, null); if (current === role) current = null; }

export const fetchDb = () => call<DB>('GET', '/db');
export const fetchPublic = () => raw<Pick<DB, 'banks' | 'batches'>>('GET', '/public/snapshot', undefined, false);

/** Uploads a prescription (PDF or photo, up to 3 MB) and returns its id. */
export async function uploadFile(file: File): Promise<{ id: string; name: string }> {
  if (file.size > 3 * 1024 * 1024) throw new ApiError(400, 'Files must be 3 MB or smaller');
  const data = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
    fr.onerror = () => reject(new ApiError(400, 'Could not read the file'));
    fr.readAsDataURL(file);
  });
  return call('POST', '/files', { name: file.name, mime: file.type || 'application/octet-stream', data });
}

/** Opens a stored prescription in a new tab. The file is fetched with the session, never put in a URL. */
export async function openFile(id: string) {
  const win = window.open('', '_blank');
  const res = await fetch(`${BASE}/api/files/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token()}` } });
  if (!res.ok) { win?.close(); throw new ApiError(res.status, res.status === 403 ? 'You cannot open this file' : 'File not found'); }
  const url = URL.createObjectURL(await res.blob());
  if (win) win.location.href = url; else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Opens the server's change feed; `onChange` fires after any write by anyone. Returns a close function. */
export function subscribe(onChange: () => void) {
  const t = token();
  if (!t) return () => {};
  const es = new EventSource(`${BASE}/api/events?token=${encodeURIComponent(t)}`);
  es.addEventListener('change', onChange);
  return () => es.close();
}

/* ---------- government directory of licensed blood centres ---------- */

export const ERAKTKOSH_URL = 'https://eraktkosh.mohfw.gov.in/eraktkoshPortal/#/';

export interface DirectoryCentre {
  id: number; name: string; state: string; district: string; city: string; address: string; pincode: string; phone: string; mobile: string;
  email: string; website: string; category: string; components: boolean | null; apheresis: boolean | null; serviceTime: string;
  license: string; licenseDate: string; renewalDate: string; lat: number | null; lng: number | null; source: string; importedAt: string;
  /** Id of the Raktkoshika centre with the same licence, when it has joined the network. */
  onNetwork: string | null;
}
export interface DirectoryMeta { total: number; states: number; importedAt: string | null; sources: { source: string; n: number }[] }
export interface ImportResult { imported: number; total: number; skipped: number; states: string[]; sample: Partial<DirectoryCentre>[] }

const qs = (o: Record<string, string | number | boolean | undefined>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && v !== false).map(([k, v]) => [k, String(v)])).toString();

export const directory = {
  meta: () => raw<DirectoryMeta>('GET', '/public/directory/meta', undefined, false),
  states: () => raw<{ state: string; count: number }[]>('GET', '/public/directory/states', undefined, false),
  districts: (state: string) => raw<{ district: string; count: number }[]>('GET', `/public/directory/districts?${qs({ state })}`, undefined, false),
  search: (f: { state?: string; district?: string; q?: string; category?: string; components?: boolean; page?: number; size?: number }) =>
    raw<{ total: number; page: number; size: number; rows: DirectoryCentre[] }>('GET', `/public/directory?${qs(f)}`, undefined, false),
  /** HQ only. Checks (dryRun) or saves a government CSV / data.gov.in JSON file. */
  import: (body: { text: string; source: string; defaultState?: string; replace: 'source' | 'state'; dryRun: boolean }) =>
    call<ImportResult>('POST', '/admin/directory/import', body),
  /** HQ and franchise: finds a licence number in the directory. */
  licence: (license: string) => call<{ match: DirectoryCentre | null }>('GET', `/admin/directory/licence?${qs({ license })}`),
};

/** A Google Maps link for a centre: exact point when the file has coordinates, otherwise its address. */
export const mapsUrl = (c: Pick<DirectoryCentre, 'lat' | 'lng' | 'name' | 'address' | 'city' | 'state'>) =>
  c.lat != null && c.lng != null
    ? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.name, c.address, c.city, c.state].filter(Boolean).join(', '))}`;
