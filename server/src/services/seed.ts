import bcrypt from 'bcryptjs';
import { ME, PERSONA, makeSeed } from '../../../src/data/seed.ts';
import type { Role } from '../../../src/data/types.ts';
import { config } from '../config.ts';
import { ALL_MODELS, AccountEntry, Application, Audit, Bank, Batch, Camp, Donation, DonorRequest, Lead, Ledger, MonthStat, Notice, Order, Plan, Profile, Referral, Sensor, Thread, Ticket, User, Wallet } from '../models/index.ts';

/** Demo sign-in numbers for the five sample accounts. */
export const DEMO_PHONES: Record<Role, string> = { user: '9000000001', bank: '9000000002', referral: '9000000003', franchise: '9000000004', admin: '9000000005' };

type L = Record<string, any>;
const withId = <T extends { id: string }>(rows: T[], stamp?: (r: T) => string | undefined) =>
  rows.map((row) => {
    const { id, ...rest } = row;
    const at = stamp?.(row) ?? new Date().toISOString();
    return { _id: id, ...rest, createdAt: at, updatedAt: at } as L;
  });
const raw = { timestamps: false } as const;

/** Wipes every collection and loads the same sample data the frontend demo starts with (src/data/seed.ts). */
export async function seedDatabase() {
  const db = makeSeed();
  await Promise.all(Object.values(ALL_MODELS).map((M) => M.deleteMany({})));

  const hash = await bcrypt.hash(config.seedPassword, 10);
  await User.insertMany((Object.keys(ME) as Role[]).map((role) => ({
    _id: ME[role], role, name: PERSONA[role].name, org: PERSONA[role].org, initials: PERSONA[role].initials, phone: DEMO_PHONES[role], passwordHash: hash,
    bankId: role === 'bank' ? ME.bank : undefined,
  })));
  // Lifeline Clinic (r9) owns a sample order and wallet, so it gets an account too (no password: it cannot sign in).
  await User.create({ _id: 'r9', role: 'referral', name: 'Dr. A. Gokhale', org: 'Lifeline Clinic', initials: 'LC', phone: '9000000009' });

  // Order createdAt drives "newest first"; take it from each record's own timeline.
  await Bank.insertMany(withId(db.banks), raw);
  await Batch.insertMany(withId(db.batches, (b) => b.collected), raw);
  await Order.insertMany(withId(db.orders, (o) => o.events[0]?.at), raw);
  await Wallet.insertMany(Object.values(db.wallets).map((w) => ({ _id: w.ownerId, balance: w.balance, held: w.held, credits: w.credits, creditsHeld: w.creditsHeld })));
  await Ledger.insertMany(Object.values(db.wallets).flatMap((w) => w.ledger.map(({ id, ...l }) => ({ _id: id, ownerId: w.ownerId, ...l }))));
  await Donation.insertMany(withId(db.donations, (d) => d.date), raw);
  await Camp.insertMany(withId(db.camps), raw);
  const reqAt = (i: number) => new Date(Date.now() - i * 6e4).toISOString();
  await DonorRequest.insertMany(withId(db.requests).map((r, i) => ({ ...r, createdAt: reqAt(i), updatedAt: reqAt(i) })), raw);
  await Thread.insertMany(withId(db.threads, (t) => t.messages.at(-1)?.at), raw);
  const bankNotice = (n: L) => (n.to === 'bank' ? ME.bank : n.to === 'user' ? ME.user : n.to === 'referral' ? ME.referral : n.to === 'franchise' ? ME.franchise : undefined);
  await Notice.insertMany(withId(db.notices).map((n) => ({ ...n, ownerId: bankNotice(n) })), raw);
  await Referral.insertMany(withId(db.referrals));
  await AccountEntry.insertMany(withId(db.accounts));
  await Application.insertMany(withId(db.applications));
  await Lead.insertMany(withId(db.leads));
  await Ticket.insertMany(withId(db.tickets));
  await Audit.insertMany(withId(db.audit));
  const { id: pid, ...profile } = db.profile;
  await Profile.create({ _id: pid, ...profile });
  await Plan.insertMany(withId(db.plans));
  await MonthStat.insertMany(db.months.map((mo, i) => ({ _id: `M${i}`, ...mo, order: i })));
  await Sensor.insertMany(withId(db.sensors));

  return { users: Object.keys(ME).length, banks: db.banks.length, batches: db.batches.length, orders: db.orders.length };
}
