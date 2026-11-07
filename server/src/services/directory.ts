import { one, q, tx } from '../db.ts';
import { badRequest } from '../lib/http.ts';

/**
 * Directory of licensed blood centres, loaded from government files:
 *  - National Health Portal "Blood Bank Directory" (also published on data.gov.in and AIKOSH), CSV or the
 *    data.gov.in API's JSON
 *  - State Blood Transfusion Council lists, saved from Excel as CSV
 * Column names differ between sources, so each field accepts several spellings.
 */
type Row = Record<string, string>;

const FIELDS: Record<string, string[]> = {
  name: ['blood_bank_name', 'name_of_blood_bank', 'name_of_blood_centre', 'blood_centre_name', 'blood_center_name', 'name_of_the_blood_bank', 'blood_bank', 'name'],
  state: ['state', 'state_name', 'state_ut'],
  district: ['district', 'district_name'],
  city: ['city', 'town', 'city_town', 'taluka'],
  address: ['address', 'full_address', 'address_of_blood_bank', 'address_of_blood_centre'],
  pincode: ['pincode', 'pin_code', 'pin'],
  phone: ['contact_no', 'contact_number', 'phone', 'phone_no', 'telephone', 'landline'],
  mobile: ['mobile', 'mobile_no', 'mobile_number', 'helpline'],
  email: ['email', 'email_id', 'e_mail'],
  website: ['website', 'web_site', 'url'],
  category: ['category', 'type', 'ownership', 'type_of_blood_bank', 'type_of_blood_centre', 'govt_private'],
  components: ['blood_component_available', 'component_facility', 'components', 'bcsu'],
  apheresis: ['apheresis', 'apheresis_facility'],
  service_time: ['service_time', 'timings', 'working_hours'],
  license: ['license', 'license_no', 'licence', 'licence_no', 'license_number', 'licence_number', 'license_', 'licence_'],
  license_date: ['date_license_obtained', 'date_of_license', 'license_date', 'licence_date', 'date_of_issue'],
  renewal_date: ['date_of_renewal', 'renewal_date', 'valid_upto', 'validity', 'valid_till'],
  lat: ['latitude', 'lat'],
  lng: ['longitude', 'long', 'lng', 'lon'],
};

const key = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().replace(/^(na|n\/a|nil|null|-|0)$/i, '');
const yesNo = (v: string) => (/^(y|yes|true|1|available)$/i.test(v) ? true : /^(n|no|false|0|not available)$/i.test(v) ? false : null);
const coord = (v: string, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max && n !== 0 ? n : null; };
const title = (s: string) => (s && s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s);

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes. */
export function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  if (rows.length < 2) return [];
  const head = rows[0].map(key);
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

/** Accepts CSV text, or data.gov.in API JSON (`{ records: [...] }`) / a plain JSON array. */
export function readFile(text: string): Row[] {
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    let data: unknown;
    try { data = JSON.parse(t); } catch { throw badRequest('The file looks like JSON but could not be read'); }
    const list = Array.isArray(data) ? data : (data as { records?: unknown[] }).records;
    if (!Array.isArray(list)) throw badRequest('JSON must be an array of rows or have a "records" array (data.gov.in format)');
    return list.map((r) => Object.fromEntries(Object.entries(r as object).map(([k, v]) => [key(k), String(v ?? '')])));
  }
  return parseCsv(text);
}

export interface Centre {
  name: string; state: string; district: string; city: string; address: string; pincode: string; phone: string; mobile: string;
  email: string; website: string; category: string; components: boolean | null; apheresis: boolean | null; service_time: string;
  license: string; license_date: string; renewal_date: string; lat: number | null; lng: number | null;
}

/** Maps rows to centres. `defaultState` fills in the state for single-state files such as an SBTC list. */
export function mapRows(rows: Row[], defaultState = ''): { centres: Centre[]; skipped: number; missing: string[] } {
  if (!rows.length) return { centres: [], skipped: 0, missing: ['name'] };
  const cols = Object.keys(rows[0]);
  const pick = (field: string) => FIELDS[field].find((a) => cols.includes(a));
  const map = Object.fromEntries(Object.keys(FIELDS).map((f) => [f, pick(f)]));
  const missing = ['name', ...(defaultState ? [] : ['state'])].filter((f) => !map[f]);
  if (missing.length) return { centres: [], skipped: rows.length, missing };
  const get = (r: Row, f: string) => (map[f] ? clean(r[map[f]!]) : '');
  const centres: Centre[] = [];
  let skipped = 0;
  for (const r of rows) {
    const name = get(r, 'name');
    const state = title(get(r, 'state') || defaultState);
    if (!name || !state) { skipped++; continue; }
    centres.push({
      name: title(name), state, district: title(get(r, 'district')), city: title(get(r, 'city')), address: get(r, 'address'), pincode: get(r, 'pincode'),
      phone: get(r, 'phone'), mobile: get(r, 'mobile'), email: get(r, 'email').toLowerCase(), website: get(r, 'website'), category: title(get(r, 'category')),
      components: yesNo(get(r, 'components')), apheresis: yesNo(get(r, 'apheresis')), service_time: get(r, 'service_time'),
      license: get(r, 'license'), license_date: get(r, 'license_date'), renewal_date: get(r, 'renewal_date'),
      lat: coord(get(r, 'lat'), 6, 38), lng: coord(get(r, 'lng'), 68, 98),
    });
  }
  return { centres, skipped, missing: [] };
}

const COLS = ['name', 'state', 'district', 'city', 'address', 'pincode', 'phone', 'mobile', 'email', 'website', 'category', 'components', 'apheresis', 'service_time', 'license', 'license_date', 'renewal_date', 'lat', 'lng', 'source'] as const;

/**
 * Imports a government file. `replace: 'source'` swaps out the rows from the same source label;
 * `replace: 'state'` swaps out every row of the states in the file (use for a newer SBTC list).
 */
export async function importDirectory(text: string, opts: { source: string; defaultState?: string; replace?: 'source' | 'state'; dryRun?: boolean }) {
  const rows = readFile(text);
  if (!rows.length) throw badRequest('No rows found. Upload a CSV with a header row, or data.gov.in JSON.');
  const { centres, skipped, missing } = mapRows(rows, opts.defaultState);
  if (missing.length) throw badRequest(`Could not find a column for: ${missing.join(', ')}. Columns in the file: ${Object.keys(rows[0]).slice(0, 25).join(', ')}`);
  if (!centres.length) throw badRequest('No usable rows: every row was missing a centre name or state');
  const states = [...new Set(centres.map((c) => c.state))].sort();
  const sample = centres.slice(0, 5);
  if (opts.dryRun) return { imported: 0, skipped, states, sample, total: centres.length };

  await tx(async (c) => {
    if (opts.replace === 'state') await q('delete from directory_centres where lower(state) = any($1)', [states.map((s) => s.toLowerCase())], c);
    else await q('delete from directory_centres where source = $1', [opts.source], c);
    for (let i = 0; i < centres.length; i += 300) {
      const chunk = centres.slice(i, i + 300);
      const params: unknown[] = [];
      const values = chunk.map((ce) => `(${COLS.map((col) => { params.push(col === 'source' ? opts.source : ce[col as keyof Centre]); return `$${params.length}`; }).join(',')})`).join(',');
      await q(`insert into directory_centres (${COLS.join(',')}) values ${values}`, params, c);
    }
  });
  return { imported: centres.length, skipped, states, sample, total: centres.length };
}

/* ---------- reading ---------- */

const out = (r: Record<string, any>) => ({
  id: r.id, name: r.name, state: r.state, district: r.district, city: r.city, address: r.address, pincode: r.pincode, phone: r.phone,
  mobile: r.mobile, email: r.email, website: r.website, category: r.category, components: r.components, apheresis: r.apheresis,
  serviceTime: r.service_time, license: r.license, licenseDate: r.license_date, renewalDate: r.renewal_date, lat: r.lat, lng: r.lng,
  source: r.source, importedAt: r.imported_at instanceof Date ? r.imported_at.toISOString() : r.imported_at,
  onNetwork: r.network_bank_id ?? null,
});

export async function directoryMeta() {
  const r = await one<{ total: number; states: number; latest: Date | null }>(`select count(*)::int as total, count(distinct lower(state))::int as states, max(imported_at) as latest from directory_centres`);
  const sources = await q<{ source: string; n: number }>('select source, count(*)::int as n from directory_centres group by source order by n desc');
  return { total: r?.total ?? 0, states: r?.states ?? 0, importedAt: r?.latest ? r.latest.toISOString() : null, sources };
}

export async function directoryStates() {
  return q<{ state: string; count: number }>(`select min(state) as state, count(*)::int as count from directory_centres group by lower(state) order by 1`);
}

export async function directoryDistricts(state: string) {
  return q<{ district: string; count: number }>(`select min(district) as district, count(*)::int as count from directory_centres
    where lower(state) = lower($1) and district <> '' group by lower(district) order by 1`, [state]);
}

export async function searchDirectory(f: { state?: string; district?: string; q?: string; category?: string; components?: boolean; page: number; size: number }) {
  const where: string[] = [];
  const p: unknown[] = [];
  const add = (sql: string, v: unknown) => { p.push(v); where.push(sql.replace('?', `$${p.length}`)); };
  if (f.state) add('lower(d.state) = lower(?)', f.state);
  if (f.district) add('lower(d.district) = lower(?)', f.district);
  if (f.category) add('d.category ilike ?', `%${f.category}%`);
  if (f.components) where.push('d.components is true');
  if (f.q) {
    p.push(`%${f.q}%`);
    const n = `$${p.length}`;
    where.push(`(d.name ilike ${n} or d.city ilike ${n} or d.address ilike ${n} or d.district ilike ${n} or d.pincode = trim(both '%' from ${n}))`);
  }
  const w = where.length ? `where ${where.join(' and ')}` : '';
  const total = (await one<{ n: number }>(`select count(*)::int as n from directory_centres d ${w}`, p))!.n;
  const rows = await q(`select d.*, (select b.id from banks b where b.verified and d.license <> '' and lower(b.license) = lower(d.license) limit 1) as network_bank_id
    from directory_centres d ${w} order by d.state, d.district, d.name limit ${f.size} offset ${(f.page - 1) * f.size}`, p);
  return { total, page: f.page, size: f.size, rows: rows.map(out) };
}

/** Looks a licence number up in the directory, for HQ's verification. */
export async function findLicence(license: string) {
  const norm = license.replace(/\s+/g, '').toLowerCase();
  if (!norm) return null;
  const r = await one(`select * from directory_centres where replace(lower(license), ' ', '') = $1 limit 1`, [norm]);
  return r ? out(r) : null;
}

/** Directory centres nearest a point, by straight-line distance (km). Only rows that have coordinates. */
export async function nearbyDirectory(lat: number, lng: number, limit: number) {
  const rows = await q(`select * from (
      select d.*, 6371 * 2 * asin(sqrt(power(sin(radians(d.lat - $1) / 2), 2) + cos(radians($1)) * cos(radians(d.lat)) * power(sin(radians(d.lng - $2) / 2), 2))) as km,
        (select b.id from banks b where b.verified and d.license <> '' and lower(b.license) = lower(d.license) limit 1) as network_bank_id
      from directory_centres d where d.lat is not null and d.lng is not null
    ) x order by km limit $3`, [lat, lng, limit]);
  return rows.map((r) => ({ ...out(r), km: Math.round(Number(r.km) * 10) / 10 }));
}
