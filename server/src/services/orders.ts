import type pg from 'pg';
import type { BloodGroup, Component, Stage } from '../../../src/data/types.ts';
import { COMPONENTS, processingFee, uid } from '../../../src/data/rules.ts';
import { db, one, q, run, tx, type Db } from '../db.ts';
import { actor, assertCentre, type Me } from '../lib/auth.ts';
import { badRequest, conflict, forbidden, notFound, paymentRequired } from '../lib/http.ts';
import { audit, ensureWallet, ledger, notify, roleOf } from '../lib/records.ts';
import { orderOut } from '../lib/rows.ts';

export interface NewOrderInput {
  id?: string; kind: 'order' | 'booking'; urgency: 'sos' | 'routine';
  patient: { name: string; age: number; hospital: string; ward: string; doctor: string };
  group: BloodGroup; component: Component; units: number; bankId: string; scheduledFor?: string; seriesId?: string;
  fulfilment: 'collect' | 'delivery'; rx: string; rxFileId?: string; method: 'wallet' | 'counter'; creditsToUse: number;
}

const FLOW: Stage[] = ['placed', 'rx_verified', 'sample_received', 'crossmatched', 'issued', 'completed'];
const OPEN: Stage[] = ['placed', 'rx_verified', 'sample_received', 'crossmatched'];
const plural = (n: number) => (n > 1 ? 's' : '');
type Row = Record<string, any>;

async function freshOrderId(c: Db, wanted?: string) {
  if (wanted) {
    if (await one('select 1 from orders where id = $1', [wanted], c)) throw conflict(`Order ${wanted} already exists`);
    return wanted;
  }
  for (let i = 0; i < 10; i++) {
    const id = `RK-${Math.floor(20500 + Math.random() * 79000)}`;
    if (!(await one('select 1 from orders where id = $1', [id], c))) return id;
  }
  return uid('RK');
}

/**
 * Places an order and puts the money on hold, all in one transaction. Money moves through three states:
 * available → held → settled to the centre (on issue), or held → released back (decline/cancel).
 * The wallet row is locked first, so two orders racing for the same rupees cannot both win.
 */
export async function placeOrder(m: Me, input: NewOrderInput) {
  if (m.role !== 'user' && m.role !== 'referral') throw forbidden('Only patients and referral partners place orders');
  const id = await tx(async (c) => {
    const bank = await one('select * from banks where id = $1', [input.bankId], c);
    if (!bank) throw notFound('Blood centre not found');
    if (!bank.verified) throw conflict('This centre is not verified yet');
    if (input.rxFileId && !(await one('select 1 from files where id = $1 and owner_id = $2', [input.rxFileId, m.id], c))) throw badRequest('Prescription file not found');

    const id = await freshOrderId(c, input.id);
    const fee = processingFee(input.component, bank as { type: 'Government' | 'Charitable' | 'Private' });
    const creditsUsed = Math.min(input.creditsToUse, input.units);
    const cash = (input.units - creditsUsed) * fee;

    await ensureWallet(m.id, c);
    const w = await one('select * from wallets where owner_id = $1 for update', [m.id], c);
    if (input.method === 'wallet' && cash > w!.balance) throw paymentRequired(`Wallet balance is below ₹${cash}. Add money or pay at the counter.`);
    if (creditsUsed > w!.credits) throw paymentRequired('Not enough donor credits');
    await q(`update wallets set balance = balance - $2, held = held + $2, credits = credits - $3, credits_held = credits_held + $3 where owner_id = $1`,
      [m.id, input.method === 'wallet' ? cash : 0, creditsUsed], c);

    await q(`insert into orders (id, owner_id, kind, urgency, patient_name, patient_age, hospital, ward, doctor, grp, component, units, bank_id, scheduled_for,
      series_id, fulfilment, rx, rx_file_id, stage, pay_method, fee, total, credits_used, cash, settled)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'placed',$19,$20,$21,$22,$23,false)`,
      [id, m.id, input.kind, input.urgency, input.patient.name, input.patient.age, input.patient.hospital, input.patient.ward, input.patient.doctor,
        input.group, input.component, input.units, input.bankId, input.scheduledFor ?? null, input.seriesId ?? null, input.fulfilment, input.rx,
        input.rxFileId ?? null, input.method, fee, fee * input.units, creditsUsed, cash], c);
    await q('insert into order_events (order_id, stage) values ($1, $2)', [id, 'placed'], c);

    if (input.method === 'wallet' && cash) await ledger(m.id, 'hold', -cash, 0, `Held for order ${id}`, id, c);
    if (creditsUsed) await ledger(m.id, 'credit_hold', 0, -creditsUsed, `Credit reserved for order ${id}`, id, c);
    await notify('bank', `${input.urgency === 'sos' ? 'SOS: ' : ''}${input.units} unit${plural(input.units)} ${input.group} ${COMPONENTS[input.component].short}`,
      `${input.patient.hospital} · ${id}`, input.urgency === 'sos' ? 'crit' : 'info', 'requests', bank.parent_id ?? bank.id, c);
    await audit(actor(m), input.urgency === 'sos' ? 'Placed SOS order' : input.kind === 'booking' ? 'Booked units' : 'Placed order', id, c);
    return id;
  });
  return getOrder(id);
}

async function loadRow(id: string, c: Db, lock = false) {
  const o = await one(`select * from orders where id = $1${lock ? ' for update' : ''}`, [id], c);
  if (!o) throw notFound('Order not found');
  return o;
}

export async function getOrder(id: string, c?: Db) {
  const o = await loadRow(id, c ?? db());
  const ev = await q('select stage, at, note from order_events where order_id = $1 order by id', [id], c);
  return orderOut(o, ev);
}

export function assertCanSee(m: Me, o: { ownerId: string; bankId: string }) {
  if (m.role === 'admin') return;
  if (m.role === 'bank' && m.centres.includes(o.bankId)) return;
  if (o.ownerId === m.id) return;
  throw forbidden('This order belongs to someone else');
}

const LABELS: Record<string, string> = { rx_verified: 'Prescription verified', sample_received: 'Sample received', crossmatched: 'Cross-match compatible', issued: 'Units issued', completed: 'Handed over' };

/** Moves an order one step along the flow. The order row is locked, so a double click cannot run a step twice. */
export async function advanceOrder(m: Me, id: string) {
  await tx(async (c) => {
    const o = await loadRow(id, c, true);
    assertCentre(m, o.bank_id);
    const next = FLOW[FLOW.indexOf(o.stage) + 1];
    if (!next) throw conflict(`Order is already ${o.stage}`);
    if (next === 'crossmatched') await reserveUnits(o, c);
    if (next === 'issued') await settle(o, c);
    await q('update orders set stage = $2 where id = $1', [id, next], c);
    await q('insert into order_events (order_id, stage) values ($1, $2)', [id, next], c);
    await notify(await roleOf(o.owner_id, c), `${LABELS[next]} · ${id}`, `${o.units} unit${plural(o.units)} ${o.grp} for ${o.patient_name}`,
      next === 'completed' || next === 'issued' ? 'good' : 'info', `orders/${id}`, o.owner_id, c);
    await audit(actor(m), LABELS[next], id, c);
  });
  return getOrder(id);
}

/** First-expiry-first-out: reserve the in-date units closest to expiry. Rows are locked and skipped if another order holds them. */
async function reserveUnits(o: Row, c: pg.PoolClient) {
  const units = await q<{ id: string }>(`select id from batches where bank_id = $1 and grp = $2 and component = $3 and status = 'available' and expiry > now()
    order by expiry limit $4 for update skip locked`, [o.bank_id, o.grp, o.component, o.units], c);
  if (units.length < o.units) {
    throw conflict(`Only ${units.length} in-date unit${plural(units.length)} of ${o.grp} ${COMPONENTS[o.component as Component].short.toLowerCase()} in stock, ${o.units} needed`);
  }
  await q(`update batches set status = 'reserved', order_id = $2 where id = any($1)`, [units.map((u) => u.id), o.id], c);
}

async function settle(o: Row, c: pg.PoolClient) {
  await q(`update batches set status = 'issued' where order_id = $1 and status = 'reserved'`, [o.id], c);
  if (o.pay_method === 'wallet' && o.cash) {
    await q('update wallets set held = held - $2 where owner_id = $1', [o.owner_id, o.cash], c);
    await ledger(o.owner_id, 'capture', -o.cash, 0, `Processing charge, order ${o.id}`, o.id, c);
    await ensureWallet(o.bank_id, c);
    await q('update wallets set balance = balance + $2 where owner_id = $1', [o.bank_id, o.cash], c);
    await ledger(o.bank_id, 'settlement', o.cash, 0, `Received, order ${o.id}`, o.id, c);
  }
  if (o.credits_used) {
    await q('update wallets set credits_held = credits_held - $2 where owner_id = $1', [o.owner_id, o.credits_used], c);
    await ledger(o.owner_id, 'credit_use', 0, 0, `${o.credits_used} credit used, order ${o.id}`, o.id, c);
  }
  await q('update orders set settled = true where id = $1', [o.id], c);
  await q('insert into account_entries (id, bank_id, kind, head, amount, ref) values ($1,$2,$3,$4,$5,$6)',
    [uid('A'), o.bank_id, 'income', `Processing charges, ${COMPONENTS[o.component as Component].short.toLowerCase()} (${o.id})`, o.total, o.id], c);
}

async function releaseHold(o: Row, why: string, c: pg.PoolClient) {
  if (o.settled) return;
  if (o.pay_method === 'wallet' && o.cash) {
    await q('update wallets set held = held - $2, balance = balance + $2 where owner_id = $1', [o.owner_id, o.cash], c);
    await ledger(o.owner_id, 'release', o.cash, 0, `Released, ${why} (${o.id})`, o.id, c);
  }
  if (o.credits_used) {
    await q('update wallets set credits_held = credits_held - $2, credits = credits + $2 where owner_id = $1', [o.owner_id, o.credits_used], c);
    await ledger(o.owner_id, 'credit_release', 0, o.credits_used, `Credit returned, ${why} (${o.id})`, o.id, c);
  }
}

/** Centre declines (rejected) or owner withdraws (cancelled). Held money and reserved units go back. */
export async function closeOrder(m: Me, id: string, stage: 'rejected' | 'cancelled', why: string) {
  await tx(async (c) => {
    const o = await loadRow(id, c, true);
    if (stage === 'rejected') assertCentre(m, o.bank_id);
    else if (o.owner_id !== m.id && m.role !== 'admin') throw forbidden('Only the person who placed the order can cancel it');
    if (!OPEN.includes(o.stage)) throw conflict(`Order is already ${o.stage} and cannot be ${stage}`);

    await q('update orders set stage = $2 where id = $1', [id, stage], c);
    await q('insert into order_events (order_id, stage, note) values ($1, $2, $3)', [id, stage, why], c);
    await releaseHold(o, stage === 'rejected' ? 'request declined' : 'order cancelled', c);
    await q(`update batches set status = 'available', order_id = null where order_id = $1 and status = 'reserved'`, [id], c);

    if (stage === 'rejected') await notify(await roleOf(o.owner_id, c), `Request declined · ${id}`, `${why}. Any held amount is back in your wallet.`, 'warn', `orders/${id}`, o.owner_id, c);
    else await notify('bank', `Order cancelled · ${id}`, why, 'warn', 'requests', o.bank_id, c);
    await audit(actor(m), stage === 'rejected' ? 'Declined order' : 'Cancelled order', id, c);
  });
  return getOrder(id);
}

export async function reportReaction(m: Me, id: string, text: string) {
  await tx(async (c) => {
    const o = await loadRow(id, c, true);
    if (o.owner_id !== m.id) throw forbidden('Only the ordering account can report a reaction');
    if (!['issued', 'completed'].includes(o.stage)) throw badRequest('Reactions can be reported only after units are issued');
    await run('update orders set reaction = $2 where id = $1', [id, text], c);
    await notify('bank', `Transfusion reaction reported · ${id}`, text, 'crit', 'quality', o.bank_id, c);
    await notify('admin', `Haemovigilance report · ${id}`, text, 'crit', 'compliance', undefined, c);
    await audit(actor(m), 'Reported transfusion reaction', id, c);
  });
  return getOrder(id);
}
