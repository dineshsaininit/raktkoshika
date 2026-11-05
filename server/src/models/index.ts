import mongoose, { Schema, type SchemaDefinition } from 'mongoose';
import { COMPONENT_KEYS, GROUPS } from '../../../src/data/rules.ts';

/**
 * One collection per entity in the frontend's DB type (src/data/types.ts).
 * `_id` is the same string id the frontend uses (RK-20418, b1, U1042…), so API responses map 1:1
 * onto the frontend types after `_id` is renamed to `id`.
 */
const opts = { versionKey: false as const, timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } };
const sub = (def: SchemaDefinition) => new Schema(def, { _id: false });
const str = { type: String, required: true };
const num = { type: Number, required: true };
const group = { type: String, enum: GROUPS, required: true };
const component = { type: String, enum: COMPONENT_KEYS, required: true };
const ROLES = ['user', 'bank', 'referral', 'franchise', 'admin'] as const;

function model(name: string, def: SchemaDefinition, indexes: Record<string, 1 | -1>[] = []) {
  const s = new Schema({ _id: str, ...def }, opts);
  indexes.forEach((i) => s.index(i));
  return mongoose.models[name] ?? mongoose.model(name, s);
}

/** Login accounts. `_id` is the org/person id used everywhere else (u1, b1, r1, f1, a1). */
export const User = model('User', {
  role: { type: String, enum: ROLES, required: true },
  name: str, org: str, initials: str,
  phone: { type: String, required: true, unique: true },
  passwordHash: String,
  bankId: String, // for bank staff: the centre they run
});

export const Bank = model('Bank', {
  name: str, city: str, district: str, type: { type: String, enum: ['Government', 'Charitable', 'Private'], required: true },
  license: { type: String, required: true, unique: true }, km: { type: Number, default: 0 }, rating: { type: Number, default: 5 },
  open24: { type: Boolean, default: false }, verified: { type: Boolean, default: false }, syncMin: { type: Number, default: 0 },
  parentId: String, phone: { type: String, default: '' },
}, [{ city: 1 }, { parentId: 1 }]);

export const Batch = model('Batch', {
  bankId: str, group, component, collected: { type: Date, required: true }, expiry: { type: Date, required: true },
  status: { type: String, enum: ['quarantine', 'available', 'reserved', 'issued', 'discarded'], required: true },
  source: { type: String, enum: ['Voluntary', 'Camp', 'Replacement', 'Transfer'], required: true },
  orderId: String, discardReason: String,
}, [{ bankId: 1, group: 1, component: 1, status: 1, expiry: 1 }, { orderId: 1 }]);

const STAGES = ['placed', 'rx_verified', 'sample_received', 'crossmatched', 'issued', 'completed', 'rejected', 'cancelled'];
export const Order = model('Order', {
  ownerId: str, kind: { type: String, enum: ['order', 'booking'], required: true }, urgency: { type: String, enum: ['sos', 'routine'], required: true },
  patient: sub({ name: str, age: num, hospital: str, ward: str, doctor: str }),
  group, component, units: { type: Number, required: true, min: 1 }, bankId: str, scheduledFor: Date, seriesId: String,
  fulfilment: { type: String, enum: ['collect', 'delivery'], required: true }, rx: str,
  stage: { type: String, enum: STAGES, required: true },
  events: [sub({ stage: { type: String, enum: STAGES, required: true }, at: { type: Date, required: true }, note: String })],
  payment: sub({ method: { type: String, enum: ['wallet', 'counter'], required: true }, fee: num, total: num, creditsUsed: num, cash: num, settled: { type: Boolean, required: true } }),
  reaction: String,
}, [{ ownerId: 1, createdAt: -1 }, { bankId: 1, stage: 1 }]);

/** Money is in whole rupees. Ledger lines live in their own collection so a wallet document never grows unbounded. */
export const Wallet = model('Wallet', {
  balance: { type: Number, default: 0 }, held: { type: Number, default: 0 },
  credits: { type: Number, default: 0 }, creditsHeld: { type: Number, default: 0 },
});
const LEDGER_KINDS = ['topup', 'hold', 'capture', 'release', 'refund', 'credit_earn', 'credit_hold', 'credit_use', 'credit_release', 'credit_gift', 'settlement'];
export const Ledger = model('Ledger', {
  ownerId: str, at: { type: Date, required: true }, kind: { type: String, enum: LEDGER_KINDS, required: true },
  amount: num, credits: num, note: str, ref: String,
}, [{ ownerId: 1, at: -1 }]);

export const Donation = model('Donation', {
  donorId: str, donorName: str, group, bankId: str, date: { type: Date, required: true }, slot: str,
  status: { type: String, enum: ['booked', 'completed', 'deferred', 'cancelled'], required: true }, hb: Number, note: String, campId: String,
}, [{ bankId: 1, date: -1 }, { donorId: 1 }]);

export const Camp = model('Camp', {
  org: str, requestedBy: str, venue: str, city: str, date: { type: Date, required: true }, target: num, bankIds: [String], acceptedBy: String,
  status: { type: String, enum: ['requested', 'accepted', 'completed', 'declined'], required: true }, registered: { type: Number, default: 0 }, collected: { type: Number, default: 0 },
});

export const DonorRequest = model('DonorRequest', {
  byId: str, byName: str, group, units: num, hospital: str, city: str, neededBy: { type: Date, required: true }, note: { type: String, default: '' },
  feeSupport: { type: Boolean, default: false }, responders: [String], status: { type: String, enum: ['open', 'fulfilled', 'closed'], required: true }, broadcast: Boolean,
});

export const Thread = model('Thread', {
  title: str, subtitle: { type: String, default: '' }, members: [String], kind: { type: String, enum: ['direct', 'broadcast'], required: true },
  messages: [sub({ id: str, from: str, text: str, at: { type: Date, required: true } })],
}, [{ members: 1 }]);

export const Notice = model('Notice', {
  to: { type: String, enum: [...ROLES, 'all'], required: true }, title: str, body: str, at: { type: Date, required: true },
  read: { type: Boolean, default: false }, link: String, tone: { type: String, enum: ['info', 'good', 'warn', 'crit'], required: true },
  /** Set to limit a notice to one account or centre; empty means everyone in the role sees it. */
  ownerId: String,
}, [{ to: 1, at: -1 }]);

export const Referral = model('Referral', {
  bankId: str, name: str, kind: { type: String, enum: ['Hospital', 'Clinic', 'Doctor', 'Nursing home'], required: true }, city: str,
  plan: { type: String, enum: ['Monthly', 'Quarterly', 'Yearly'], required: true }, units: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'invited'], required: true }, contact: str,
});

export const AccountEntry = model('AccountEntry', {
  bankId: str, at: { type: Date, required: true }, kind: { type: String, enum: ['income', 'expense'], required: true }, head: str, amount: num, ref: String,
}, [{ bankId: 1, at: -1 }]);

export const Application = model('Application', {
  name: str, city: str, district: str, license: str, docs: [sub({ name: str, ok: Boolean })], franchiseId: str,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], required: true }, at: { type: Date, required: true },
  type: { type: String, enum: ['Government', 'Charitable', 'Private'], required: true },
});

export const Lead = model('Lead', { name: str, city: str, contact: str, stage: { type: String, enum: ['Lead', 'Demo done', 'Documents', 'Live'], required: true }, plan: str });

export const Ticket = model('Ticket', { from: str, subject: str, priority: { type: String, enum: ['High', 'Normal'], required: true }, status: { type: String, enum: ['open', 'resolved'], required: true }, at: { type: Date, required: true } });

export const Audit = model('Audit', { at: { type: Date, required: true }, actor: str, action: str, target: str }, [{ at: -1 }]);

export const Profile = model('Profile', {
  name: str, phone: str, city: str, group, age: num, weight: num, sex: { type: String, enum: ['F', 'M'], required: true },
  lastDonation: Date, donorActive: { type: Boolean, default: true }, rareDonor: { type: Boolean, default: false }, shareContact: { type: Boolean, default: false },
  family: [sub({ id: str, name: str, relation: str, group })],
});

export const Plan = model('Plan', {
  ownerId: str, patient: str, group, component, units: num, everyDays: num, bankId: str, next: { type: Date, required: true }, active: { type: Boolean, default: true },
});

export const MonthStat = model('MonthStat', { m: str, collected: num, issued: num, order: num });

export const Sensor = model('Sensor', {
  bankId: str, name: str, kind: { type: String, enum: ['Red cells', 'Platelets', 'Plasma'], required: true }, temp: num, min: num, max: num,
});

export const ALL_MODELS = {
  User, Bank, Batch, Order, Wallet, Ledger, Donation, Camp, DonorRequest, Thread, Notice, Referral,
  AccountEntry, Application, Lead, Ticket, Audit, Profile, Plan, MonthStat, Sensor,
};

/** `{ _id, createdAt, updatedAt, ...rest }` → `{ id, ...rest }`, the shape the frontend expects. */
export function toApi<T extends Record<string, unknown>>(doc: T): Omit<T, '_id' | 'createdAt' | 'updatedAt'> & { id: string } {
  const { _id, createdAt: _c, updatedAt: _u, ...rest } = doc as Record<string, unknown>;
  return { id: String(_id), ...rest } as never;
}
