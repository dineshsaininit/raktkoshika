import type { BloodGroup, Component, Stage } from '../../../src/data/types.ts';
import { COMPONENTS, processingFee, uid } from '../../../src/data/rules.ts';
import { actor, assertCentre, type Me } from '../lib/auth.ts';
import { badRequest, conflict, forbidden, notFound, paymentRequired } from '../lib/http.ts';
import { audit, ensureWallet, ledger, notify, now, roleOf } from '../lib/records.ts';
import { AccountEntry, Bank, Batch, Order, Wallet } from '../models/index.ts';

export interface NewOrderInput {
  id?: string; kind: 'order' | 'booking'; urgency: 'sos' | 'routine';
  patient: { name: string; age: number; hospital: string; ward: string; doctor: string };
  group: BloodGroup; component: Component; units: number; bankId: string; scheduledFor?: string; seriesId?: string;
  fulfilment: 'collect' | 'delivery'; rx: string; method: 'wallet' | 'counter'; creditsToUse: number;
}

const FLOW: Stage[] = ['placed', 'rx_verified', 'sample_received', 'crossmatched', 'issued', 'completed'];
const OPEN: Stage[] = ['placed', 'rx_verified', 'sample_received', 'crossmatched'];
const plural = (n: number) => (n > 1 ? 's' : '');

async function freshOrderId(wanted?: string) {
  if (wanted) {
    if (await Order.exists({ _id: wanted })) throw conflict(`Order ${wanted} already exists`);
    return wanted;
  }
  for (let i = 0; i < 10; i++) {
    const id = `RK-${Math.floor(20500 + Math.random() * 79000)}`;
    if (!(await Order.exists({ _id: id }))) return id;
  }
  return uid('RK');
}

/**
 * Places an order and puts the money on hold. Money moves through three states:
 * available → held → settled to the centre (on issue), or held → released back (decline/cancel).
 * Balance checks are part of the update filter, so two orders racing for the same rupees cannot both win.
 */
export async function placeOrder(m: Me, input: NewOrderInput) {
  if (m.role !== 'user' && m.role !== 'referral') throw forbidden('Only patients and referral partners place orders');
  const bank = await Bank.findById(input.bankId).lean<Record<string, any>>();
  if (!bank) throw notFound('Blood centre not found');
  if (!bank.verified) throw conflict('This centre is not verified yet');

  const id = await freshOrderId(input.id);
  const fee = processingFee(input.component, bank as { type: 'Government' | 'Charitable' | 'Private' });
  const creditsUsed = Math.min(input.creditsToUse, input.units);
  const cash = (input.units - creditsUsed) * fee;

  await ensureWallet(m.id);
  if (input.method === 'wallet' && cash) {
    const r = await Wallet.updateOne({ _id: m.id, balance: { $gte: cash } }, { $inc: { balance: -cash, held: cash } });
    if (!r.modifiedCount) throw paymentRequired(`Wallet balance is below ₹${cash}. Add money or pay at the counter.`);
  }
  if (creditsUsed) {
    const r = await Wallet.updateOne({ _id: m.id, credits: { $gte: creditsUsed } }, { $inc: { credits: -creditsUsed, creditsHeld: creditsUsed } });
    if (!r.modifiedCount) {
      if (input.method === 'wallet' && cash) await Wallet.updateOne({ _id: m.id }, { $inc: { balance: cash, held: -cash } });
      throw paymentRequired('Not enough donor credits');
    }
  }

  await Order.create({
    _id: id, ownerId: m.id, kind: input.kind, urgency: input.urgency, patient: input.patient, group: input.group, component: input.component,
    units: input.units, bankId: input.bankId, scheduledFor: input.scheduledFor, seriesId: input.seriesId, fulfilment: input.fulfilment, rx: input.rx,
    stage: 'placed', events: [{ stage: 'placed', at: now() }],
    payment: { method: input.method, fee, total: fee * input.units, creditsUsed, cash, settled: false },
  });
  if (input.method === 'wallet' && cash) await ledger(m.id, 'hold', -cash, 0, `Held for order ${id}`, id);
  if (creditsUsed) await ledger(m.id, 'credit_hold', 0, -creditsUsed, `Credit reserved for order ${id}`, id);
  await notify('bank', `${input.urgency === 'sos' ? 'SOS: ' : ''}${input.units} unit${plural(input.units)} ${input.group} ${COMPONENTS[input.component].short}`,
    `${input.patient.hospital} · ${id}`, input.urgency === 'sos' ? 'crit' : 'info', 'requests', bank.parentId ?? bank._id);
  await audit(actor(m), input.urgency === 'sos' ? 'Placed SOS order' : input.kind === 'booking' ? 'Booked units' : 'Placed order', id);
  return getOrder(id);
}

export async function getOrder(id: string) {
  const o = await Order.findById(id).lean<Record<string, any>>();
  if (!o) throw notFound('Order not found');
  return o;
}

export function assertCanSee(m: Me, o: Record<string, any>) {
  if (m.role === 'admin' || m.role === 'franchise') return;
  if (m.role === 'bank' && m.centres.includes(o.bankId)) return;
  if (o.ownerId === m.id) return;
  throw forbidden('This order belongs to someone else');
}

/** Moves an order one step along the flow. Allocation and settlement happen on the steps that need them. */
export async function advanceOrder(m: Me, id: string) {
  const o = await getOrder(id);
  assertCentre(m, o.bankId);
  const next = FLOW[FLOW.indexOf(o.stage) + 1];
  if (!next) throw conflict(`Order is already ${o.stage}`);

  // Claim the transition first so a double click cannot run it twice.
  const claimed = await Order.updateOne({ _id: id, stage: o.stage }, { $set: { stage: next }, $push: { events: { stage: next, at: now() } } });
  if (!claimed.modifiedCount) throw conflict('Order changed in the meantime, refresh and try again');

  try {
    if (next === 'crossmatched') await reserveUnits(o);
    if (next === 'issued') await settle(o);
  } catch (e) {
    await Order.updateOne({ _id: id }, { $set: { stage: o.stage }, $pop: { events: 1 } });
    throw e;
  }

  const labels: Record<string, string> = { rx_verified: 'Prescription verified', sample_received: 'Sample received', crossmatched: 'Cross-match compatible', issued: 'Units issued', completed: 'Handed over' };
  await notify(await roleOf(o.ownerId), `${labels[next]} · ${id}`, `${o.units} unit${plural(o.units)} ${o.group} for ${o.patient.name}`,
    next === 'completed' || next === 'issued' ? 'good' : 'info', `orders/${id}`, o.ownerId);
  await audit(actor(m), labels[next], id);
  return getOrder(id);
}

/** First-expiry-first-out: reserve the in-date units closest to expiry. Fails cleanly if stock is short. */
async function reserveUnits(o: Record<string, any>) {
  const candidates = await Batch.find({ bankId: o.bankId, group: o.group, component: o.component, status: 'available', expiry: { $gt: now() } })
    .sort({ expiry: 1 }).limit(o.units * 3).lean<{ _id: string }[]>();
  const got: string[] = [];
  for (const c of candidates) {
    if (got.length === o.units) break;
    const r = await Batch.updateOne({ _id: c._id, status: 'available' }, { $set: { status: 'reserved', orderId: o._id } });
    if (r.modifiedCount) got.push(c._id);
  }
  if (got.length < o.units) {
    await Batch.updateMany({ _id: { $in: got } }, { $set: { status: 'available' }, $unset: { orderId: 1 } });
    throw conflict(`Only ${got.length} in-date unit${plural(got.length)} of ${o.group} ${COMPONENTS[o.component as Component].short.toLowerCase()} in stock, ${o.units} needed`);
  }
}

async function settle(o: Record<string, any>) {
  await Batch.updateMany({ orderId: o._id, status: 'reserved' }, { $set: { status: 'issued' } });
  const p = o.payment;
  if (p.method === 'wallet' && p.cash) {
    await Wallet.updateOne({ _id: o.ownerId }, { $inc: { held: -p.cash } });
    await ledger(o.ownerId, 'capture', -p.cash, 0, `Processing charge, order ${o._id}`, o._id);
    await ensureWallet(o.bankId);
    await Wallet.updateOne({ _id: o.bankId }, { $inc: { balance: p.cash } });
    await ledger(o.bankId, 'settlement', p.cash, 0, `Received, order ${o._id}`, o._id);
  }
  if (p.creditsUsed) {
    await Wallet.updateOne({ _id: o.ownerId }, { $inc: { creditsHeld: -p.creditsUsed } });
    await ledger(o.ownerId, 'credit_use', 0, 0, `${p.creditsUsed} credit used, order ${o._id}`, o._id);
  }
  await Order.updateOne({ _id: o._id }, { $set: { 'payment.settled': true } });
  await AccountEntry.create({ _id: uid('A'), bankId: o.bankId, at: now(), kind: 'income', head: `Processing charges, ${COMPONENTS[o.component as Component].short.toLowerCase()} (${o._id})`, amount: p.total, ref: o._id });
}

async function releaseHold(o: Record<string, any>, why: string) {
  const p = o.payment;
  if (p.settled) return;
  if (p.method === 'wallet' && p.cash) {
    await Wallet.updateOne({ _id: o.ownerId }, { $inc: { held: -p.cash, balance: p.cash } });
    await ledger(o.ownerId, 'release', p.cash, 0, `Released, ${why} (${o._id})`, o._id);
  }
  if (p.creditsUsed) {
    await Wallet.updateOne({ _id: o.ownerId }, { $inc: { creditsHeld: -p.creditsUsed, credits: p.creditsUsed } });
    await ledger(o.ownerId, 'credit_release', 0, p.creditsUsed, `Credit returned, ${why} (${o._id})`, o._id);
  }
}

/** Centre declines (rejected) or owner withdraws (cancelled). Held money and reserved units go back. */
export async function closeOrder(m: Me, id: string, stage: 'rejected' | 'cancelled', why: string) {
  const o = await getOrder(id);
  if (stage === 'rejected') assertCentre(m, o.bankId);
  else if (o.ownerId !== m.id && m.role !== 'admin') throw forbidden('Only the person who placed the order can cancel it');
  if (!OPEN.includes(o.stage)) throw conflict(`Order is already ${o.stage} and cannot be ${stage}`);

  const claimed = await Order.updateOne({ _id: id, stage: o.stage }, { $set: { stage }, $push: { events: { stage, at: now(), note: why } } });
  if (!claimed.modifiedCount) throw conflict('Order changed in the meantime, refresh and try again');
  await releaseHold(o, stage === 'rejected' ? 'request declined' : 'order cancelled');
  await Batch.updateMany({ orderId: id, status: 'reserved' }, { $set: { status: 'available' }, $unset: { orderId: 1 } });

  if (stage === 'rejected') await notify(await roleOf(o.ownerId), `Request declined · ${id}`, `${why}. Any held amount is back in your wallet.`, 'warn', `orders/${id}`, o.ownerId);
  else await notify('bank', `Order cancelled · ${id}`, why, 'warn', 'requests', o.bankId);
  await audit(actor(m), stage === 'rejected' ? 'Declined order' : 'Cancelled order', id);
  return getOrder(id);
}

export async function reportReaction(m: Me, id: string, text: string) {
  const o = await getOrder(id);
  if (o.ownerId !== m.id) throw forbidden('Only the ordering account can report a reaction');
  if (!['issued', 'completed'].includes(o.stage)) throw badRequest('Reactions can be reported only after units are issued');
  await Order.updateOne({ _id: id }, { $set: { reaction: text } });
  await notify('bank', `Transfusion reaction reported · ${id}`, text, 'crit', 'quality', o.bankId);
  await notify('admin', `Haemovigilance report · ${id}`, text, 'crit', 'compliance');
  await audit(actor(m), 'Reported transfusion reaction', id);
  return getOrder(id);
}
