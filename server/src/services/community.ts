import type { BankType, BloodGroup, Component, LeadStage, Role } from '../../../src/data/types.ts';
import { uid } from '../../../src/data/rules.ts';
import { actor, assertCentre, type Me } from '../lib/auth.ts';
import { badRequest, conflict, forbidden, notFound } from '../lib/http.ts';
import { audit, notify, now } from '../lib/records.ts';
import { AccountEntry, Application, Bank, Camp, DonorRequest, Lead, Notice, Plan, Referral, Thread, Ticket, User } from '../models/index.ts';

/* ---------- Camps ---------- */

export async function requestCamp(m: Me, c: { org: string; venue: string; city: string; date: string; target: number; bankIds: string[] }) {
  if ((await Bank.countDocuments({ _id: { $in: c.bankIds } })) !== c.bankIds.length) throw badRequest('Unknown blood centre in bankIds');
  const id = uid('C');
  await Camp.create({ _id: id, ...c, requestedBy: m.id, status: 'requested', registered: 0, collected: 0 });
  for (const b of c.bankIds) await notify('bank', 'New camp request', `${c.org} · ${c.city}`, 'info', 'camps', b);
  await audit(c.org, 'Requested blood camp', c.city);
  return Camp.findById(id).lean();
}

const CAMP_NEXT: Record<string, string[]> = { requested: ['accepted', 'declined'], accepted: ['completed', 'declined'] };

export async function campRespond(m: Me, id: string, status: 'accepted' | 'declined' | 'completed', bankId: string) {
  const c = await Camp.findById(id).lean<Record<string, any>>();
  if (!c) throw notFound('Camp not found');
  assertCentre(m, bankId);
  if (!CAMP_NEXT[c.status]?.includes(status)) throw conflict(`A ${c.status} camp cannot be marked ${status}`);
  if (status === 'accepted' && !c.bankIds.includes(bankId)) throw forbidden('This camp was not sent to your centre');
  if (status !== 'accepted' && c.acceptedBy && !m.centres.includes(c.acceptedBy) && m.role !== 'admin') throw forbidden('Another centre is running this camp');
  const set: Record<string, unknown> = { status };
  if (status === 'accepted') set.acceptedBy = bankId;
  // Demo estimate until each camp donation is recorded individually.
  if (status === 'completed' && !c.collected) set.collected = Math.round(c.registered * 0.82);
  await Camp.updateOne({ _id: id, status: c.status }, { $set: set });
  await audit(m.name, `Camp ${status}`, id);
}

/* ---------- Donor requests ---------- */

export async function postRequest(m: Me, r: { group: BloodGroup; units: number; hospital: string; city: string; neededBy: string; note: string; feeSupport: boolean }) {
  const id = uid('DR');
  await DonorRequest.create({ _id: id, ...r, byId: m.id, byName: actor(m), responders: [], status: 'open' });
  await audit(actor(m), 'Posted donor request', `${r.units} × ${r.group}`);
  return DonorRequest.findById(id).lean();
}

export async function respond(m: Me, id: string) {
  const r = await DonorRequest.updateOne({ _id: id, status: 'open' }, { $addToSet: { responders: m.name } });
  if (!r.matchedCount) throw notFound('Open request not found');
}

export async function closeRequest(m: Me, id: string) {
  const r = await DonorRequest.findById(id).lean<Record<string, any>>();
  if (!r) throw notFound('Request not found');
  if (r.byId !== m.id && m.role !== 'admin') throw forbidden('Only the person who posted it can close it');
  await DonorRequest.updateOne({ _id: id }, { $set: { status: 'fulfilled' } });
}

/* ---------- Chat and notices ---------- */

export async function send(m: Me, threadId: string, text: string) {
  const msg = { id: uid('m'), from: m.id, text, at: now() };
  const r = await Thread.updateOne({ _id: threadId, members: m.id }, { $push: { messages: msg } });
  if (!r.matchedCount) throw notFound('Conversation not found');
  return msg;
}

export async function broadcast(m: Me, group: BloodGroup, city: string, note: string) {
  const by = m.role === 'admin' ? 'Raktkoshika' : m.org;
  const tid = uid('T');
  // Opted-in donors and partners. A real rollout would filter by city, group and the donorActive flag.
  const audience = await User.find({ role: { $in: ['user', 'referral', 'admin'] } }, { _id: 1 }).lean<{ _id: string }[]>();
  await Thread.create({
    _id: tid, title: `${group.replace('-', '−')} donors · ${city}`, subtitle: 'Broadcast to opted-in donors', kind: 'broadcast',
    members: [...new Set([m.id, ...audience.map((u) => u._id)])], messages: [{ id: uid('m'), from: m.id, text: note, at: now() }],
  });
  await DonorRequest.create({ _id: uid('DR'), byId: m.id, byName: by, group, units: 5, hospital: 'Network shortage alert', city, neededBy: new Date(Date.now() + 2 * 864e5), note, feeSupport: false, responders: [], status: 'open', broadcast: true });
  await notify('user', `${group} donors needed in ${city}`, note, 'warn', 'donor-requests');
  await notify('referral', `${group} shortage in ${city}`, note, 'warn', 'donor-requests');
  await audit(by, 'Sent shortage broadcast', `${group} · ${city}`);
}

export async function readNotices(m: Me, role: Role) {
  if (role !== m.role) throw forbidden();
  await Notice.updateMany({ to: role, $or: [{ ownerId: { $exists: false } }, { ownerId: null }, { ownerId: { $in: [m.id, ...m.centres] } }] }, { $set: { read: true } });
}

/* ---------- Blood centre back office ---------- */

export async function addCenter(m: Me, name: string, city: string, license: string) {
  const parent = await Bank.findById(m.id).lean<Record<string, any>>();
  if (!parent) throw notFound('Your centre record is missing');
  const id = uid('B');
  await Bank.create({ ...parent, _id: id, name, city, district: city, license, km: 20, syncMin: 0, parentId: m.id, open24: false, rating: 5, createdAt: undefined, updatedAt: undefined });
  await audit(m.name, 'Created centre', name);
  return Bank.findById(id).lean();
}

export async function addReferral(m: Me, name: string, kind: string, city: string, contact: string) {
  const id = uid('R');
  await Referral.create({ _id: id, bankId: m.id, name, kind, city, contact, plan: 'Monthly', units: 0, status: 'invited' });
  await audit(m.name, 'Invited referral', name);
  return Referral.findById(id).lean();
}

export async function addExpense(m: Me, head: string, amount: number, bankId = m.id) {
  assertCentre(m, bankId);
  const id = uid('A');
  await AccountEntry.create({ _id: id, bankId, at: now(), kind: 'expense', head, amount });
  return AccountEntry.findById(id).lean();
}

/* ---------- Regular transfusion plans ---------- */

export async function addPlan(m: Me, p: { patient: string; group: BloodGroup; component: Component; units: number; everyDays: number; bankId: string; next: string }) {
  if (!(await Bank.exists({ _id: p.bankId }))) throw notFound('Blood centre not found');
  const id = uid('T');
  await Plan.create({ _id: id, ...p, ownerId: m.id, active: true });
  return Plan.findById(id).lean();
}

export async function togglePlan(m: Me, id: string) {
  const p = await Plan.findById(id).lean<Record<string, any>>();
  if (!p) throw notFound('Plan not found');
  if (p.ownerId !== m.id) throw forbidden();
  await Plan.updateOne({ _id: id }, { $set: { active: !p.active } });
}

/* ---------- Franchise and network ops ---------- */

export async function submitApplication(m: Me, a: { name: string; city: string; license: string; type?: BankType }) {
  const id = uid('AP');
  await Application.create({
    _id: id, name: a.name, city: a.city, district: a.city, license: a.license, type: a.type ?? 'Charitable', franchiseId: m.id, status: 'pending', at: now(),
    docs: ['FDA blood centre licence', 'SBTC registration', 'Medical officer registration', 'e-RaktKosh ID'].map((name) => ({ name, ok: true })),
  });
  await notify('admin', 'New centre application', `${a.name} · ${a.city}`, 'warn', 'verification');
  await audit(m.name, 'Submitted centre application', a.name);
  return Application.findById(id).lean();
}

export async function decideApplication(m: Me, id: string, status: 'approved' | 'rejected') {
  const a = await Application.findById(id).lean<Record<string, any>>();
  if (!a) throw notFound('Application not found');
  const r = await Application.updateOne({ _id: id, status: 'pending' }, { $set: { status } });
  if (!r.modifiedCount) throw conflict(`Application is already ${a.status}`);
  if (status === 'approved') {
    await Bank.create({ _id: uid('B'), name: a.name, city: a.city, district: a.district, type: a.type, license: a.license, km: 60, rating: 5, open24: false, verified: true, syncMin: 1, phone: '' });
    await Lead.updateOne({ name: a.name }, { $set: { stage: 'Live' } });
    await notify('franchise', `${a.name} is live`, 'Licence verified by Raktkoshika.', 'good', 'pipeline', a.franchiseId);
  } else await notify('franchise', `${a.name} needs corrections`, 'Upload the missing document and resubmit.', 'warn', 'centres', a.franchiseId);
  await audit(m.name, status === 'approved' ? 'Approved centre' : 'Sent back application', a.name);
}

export async function addLead(_m: Me, l: { name: string; city: string; contact: string; plan: string }) {
  const id = uid('LD');
  await Lead.create({ _id: id, ...l, stage: 'Lead' });
  return Lead.findById(id).lean();
}

export async function moveLead(_m: Me, id: string, stage: LeadStage) {
  const r = await Lead.updateOne({ _id: id }, { $set: { stage } });
  if (!r.matchedCount) throw notFound('Lead not found');
}

export async function addTicket(m: Me, subject: string) {
  const id = uid('TK');
  await Ticket.create({ _id: id, from: m.org, subject, priority: 'Normal', status: 'open', at: now() });
  return Ticket.findById(id).lean();
}

export async function resolveTicket(_m: Me, id: string) {
  const r = await Ticket.updateOne({ _id: id }, { $set: { status: 'resolved' } });
  if (!r.matchedCount) throw notFound('Ticket not found');
}
