import type { Notice as NoticeT, Role } from '../../../src/data/types.ts';
import { uid } from '../../../src/data/rules.ts';
import { db, one, q, type Db } from '../db.ts';

/** Side records every action writes: ledger lines, notifications, audit trail. Same as the frontend store. */
export const now = () => new Date();

export async function ensureWallet(ownerId: string, c: Db = db()) {
  await q('insert into wallets (owner_id) values ($1) on conflict (owner_id) do nothing', [ownerId], c);
}

export const ledger = (ownerId: string, kind: string, amount: number, credits: number, note: string, ref?: string, c: Db = db()) =>
  q('insert into ledger (id, owner_id, kind, amount, credits, note, ref) values ($1,$2,$3,$4,$5,$6,$7)', [uid('L'), ownerId, kind, amount, credits, note, ref ?? null], c);

export const notify = (to: NoticeT['to'], title: string, body: string, tone: NoticeT['tone'] = 'info', link?: string, ownerId?: string, c: Db = db()) =>
  q('insert into notices (id, to_role, title, body, tone, link, owner_id) values ($1,$2,$3,$4,$5,$6,$7)', [uid('N'), to, title, body, tone, link ?? null, ownerId ?? null], c);

export const audit = (actor: string, action: string, target: string, c: Db = db()) =>
  q('insert into audit (id, actor, action, target) values ($1,$2,$3,$4)', [uid('AU'), actor, action, target], c);

/** Which portal an owner id belongs to, for routing their notifications. */
export async function roleOf(ownerId: string, c: Db = db()): Promise<Role> {
  const u = await one<{ role: Role }>('select role from users where id = $1', [ownerId], c);
  return u?.role ?? 'referral';
}
