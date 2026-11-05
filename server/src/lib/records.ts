import type { Notice as NoticeT, Role } from '../../../src/data/types.ts';
import { uid } from '../../../src/data/rules.ts';
import { Audit, Ledger, Notice, User, Wallet } from '../models/index.ts';

/** Side records every action writes: ledger lines, notifications, audit trail. Same as the frontend store. */
export const now = () => new Date();

export async function ensureWallet(ownerId: string) {
  await Wallet.updateOne({ _id: ownerId }, { $setOnInsert: { balance: 0, held: 0, credits: 0, creditsHeld: 0 } }, { upsert: true });
}

export const ledger = (ownerId: string, kind: string, amount: number, credits: number, note: string, ref?: string) =>
  Ledger.create({ _id: uid('L'), ownerId, at: now(), kind, amount, credits, note, ref });

export const notify = (to: NoticeT['to'], title: string, body: string, tone: NoticeT['tone'] = 'info', link?: string, ownerId?: string) =>
  Notice.create({ _id: uid('N'), to, title, body, at: now(), read: false, tone, link, ownerId });

export const audit = (actor: string, action: string, target: string) =>
  Audit.create({ _id: uid('AU'), at: now(), actor, action, target });

/** Which portal an owner id belongs to, for routing their notifications. */
export async function roleOf(ownerId: string): Promise<Role> {
  const u = await User.findById(ownerId, { role: 1 }).lean<{ role: Role }>();
  return u?.role ?? 'referral';
}
