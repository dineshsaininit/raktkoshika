import type { BloodGroup, Component } from '../../../src/data/types.ts';
import { COMPONENTS, MIN_HB, daysUntilEligible, uid } from '../../../src/data/rules.ts';
import { actor, assertCentre, type Me } from '../lib/auth.ts';
import { badRequest, conflict, forbidden, notFound, paymentRequired } from '../lib/http.ts';
import { audit, ensureWallet, ledger, notify, now, roleOf } from '../lib/records.ts';
import { Bank, Batch, Camp, Donation, Profile, Wallet } from '../models/index.ts';

/* ---------- Wallet ---------- */

/** Demo top-up. In production this runs from the payment gateway's verified webhook, never from the client. */
export async function topUp(m: Me, amount: number, method: string) {
  await ensureWallet(m.id);
  await Wallet.updateOne({ _id: m.id }, { $inc: { balance: amount } });
  await ledger(m.id, 'topup', amount, 0, `Added via ${method}`);
}

export async function settle(m: Me, amount: number) {
  const r = await Wallet.updateOne({ _id: m.id, balance: { $gte: amount } }, { $inc: { balance: -amount } });
  if (!r.modifiedCount) throw paymentRequired('Payout is larger than the available balance');
  await ledger(m.id, 'settlement', -amount, 0, 'Paid out to registered bank account');
  await audit(actor(m), 'Requested payout', `₹${amount}`);
}

export async function giftCredit(m: Me, member: string) {
  const p = await Profile.findById(m.id).lean<Record<string, any>>();
  if (!p?.family?.some((f: { name: string }) => f.name === member)) throw badRequest('Add this person to your family first');
  const r = await Wallet.updateOne({ _id: m.id, credits: { $gte: 1 } }, { $inc: { credits: -1 } });
  if (!r.modifiedCount) throw paymentRequired('No donor credit available');
  await ledger(m.id, 'credit_gift', 0, -1, `Reserved for family member: ${member}`);
  await audit(m.name, 'Assigned donor credit to family', member);
}

/* ---------- Profile ---------- */

export async function getProfile(m: Me) {
  const p = await Profile.findById(m.id).lean<Record<string, any>>();
  if (!p) throw notFound('Profile not found');
  return p;
}

export async function updateProfile(m: Me, patch: Record<string, unknown>) {
  const r = await Profile.findByIdAndUpdate(m.id, { $set: patch }, { returnDocument: 'after', runValidators: true }).lean();
  if (!r) throw notFound('Profile not found');
  return r;
}

export async function addFamily(m: Me, name: string, relation: string, group: BloodGroup) {
  const r = await Profile.findByIdAndUpdate(m.id, { $push: { family: { id: uid('F'), name, relation, group } } }, { returnDocument: 'after' }).lean();
  if (!r) throw notFound('Profile not found');
  return r;
}

/* ---------- Donations ---------- */

export async function bookDonation(m: Me, input: { id?: string; bankId: string; date: string; slot: string; campId?: string }) {
  const p = await getProfile(m);
  const wait = daysUntilEligible({ sex: p.sex, lastDonation: p.lastDonation?.toISOString() });
  if (wait > 0) throw conflict(`You can donate again in ${wait} days`);
  if (!(await Bank.exists({ _id: input.bankId }))) throw notFound('Blood centre not found');
  if (await Donation.exists({ donorId: m.id, status: 'booked' })) throw conflict('You already have a slot booked. Cancel it first to pick another.');
  if (input.campId) {
    const r = await Camp.updateOne({ _id: input.campId, status: 'accepted' }, { $inc: { registered: 1 } });
    if (!r.modifiedCount) throw conflict('This camp is not open for registration');
  }
  const id = input.id && !(await Donation.exists({ _id: input.id })) ? input.id : uid('D');
  await Donation.create({ _id: id, donorId: m.id, donorName: p.name, group: p.group, bankId: input.bankId, date: input.date, slot: input.slot, status: 'booked', campId: input.campId });
  await notify('bank', 'New donor slot booked', `${p.name} · ${p.group} · ${input.slot}`, 'info', 'donors', input.bankId);
  await audit(m.name, 'Booked donation slot', id);
  return Donation.findById(id).lean();
}

export async function cancelDonation(m: Me, id: string) {
  const d = await Donation.findById(id).lean<Record<string, any>>();
  if (!d) throw notFound('Booking not found');
  if (d.donorId !== m.id) throw forbidden();
  const r = await Donation.updateOne({ _id: id, status: 'booked' }, { $set: { status: 'cancelled' } });
  if (!r.modifiedCount) throw conflict('Only booked slots can be cancelled');
  if (d.campId) await Camp.updateOne({ _id: d.campId, registered: { $gt: 0 } }, { $inc: { registered: -1 } });
}

/** Records a donation at the centre. Low haemoglobin defers the donor; otherwise units enter quarantine and the donor earns a credit. */
export async function recordDonation(m: Me, id: string, hb: number) {
  const d = await Donation.findById(id).lean<Record<string, any>>();
  if (!d) throw notFound('Donation not found');
  assertCentre(m, d.bankId);
  if (d.status !== 'booked') throw conflict(`This donation is already ${d.status}`);
  const donorRole = await roleOf(d.donorId);

  if (hb < MIN_HB) {
    await Donation.updateOne({ _id: id, status: 'booked' }, { $set: { status: 'deferred', hb, note: `Haemoglobin below ${MIN_HB} g/dL` } });
    if (donorRole === 'user') await notify('user', 'Donation deferred today', 'Your haemoglobin was below the safe limit. Try again after a few weeks of iron-rich meals.', 'warn', 'donate', d.donorId);
    await audit(m.name, 'Deferred donor', id);
    return;
  }
  const r = await Donation.updateOne({ _id: id, status: 'booked' }, { $set: { status: 'completed', hb, date: now() } });
  if (!r.modifiedCount) throw conflict('Donation changed in the meantime');
  await Profile.updateOne({ _id: d.donorId }, { $set: { lastDonation: now() } });

  // New units wait in quarantine until screening clears them.
  const camp = Boolean(d.campId);
  await Batch.insertMany((['PRBC', 'FFP'] as Component[]).map((c) => ({
    _id: uid('Q'), bankId: d.bankId, group: d.group, component: c, collected: now(),
    expiry: new Date(Date.now() + COMPONENTS[c].shelfDays * 864e5), status: 'quarantine', source: camp ? 'Camp' : 'Voluntary',
  })));
  if (camp) await Camp.updateOne({ _id: d.campId }, { $inc: { collected: 1 } });

  await ensureWallet(d.donorId);
  await Wallet.updateOne({ _id: d.donorId }, { $inc: { credits: 1 } });
  const bank = await Bank.findById(d.bankId, { name: 1 }).lean<{ name: string }>();
  await ledger(d.donorId, 'credit_earn', 0, 1, `Verified donation at ${bank?.name ?? d.bankId}`, id);
  if (donorRole === 'user') await notify('user', 'Thank you. 1 donor credit added', 'Valid at every centre in the network for 12 months.', 'good', 'wallet', d.donorId);
  await audit(m.name, 'Recorded donation, units in quarantine', id);
}

/* ---------- Stock ---------- */

export async function releaseQuarantine(m: Me, ids: string[]) {
  const units = await Batch.find({ _id: { $in: ids } }, { bankId: 1, status: 1 }).lean<{ _id: string; bankId: string; status: string }[]>();
  if (units.length !== ids.length) throw notFound('Some units were not found');
  units.forEach((u) => assertCentre(m, u.bankId));
  const r = await Batch.updateMany({ _id: { $in: ids }, status: 'quarantine' }, { $set: { status: 'available' } });
  await audit(m.name, `Released ${r.modifiedCount} unit(s) after screening`, ids[0]);
  return r.modifiedCount;
}

export async function discard(m: Me, id: string, reason: string) {
  const u = await Batch.findById(id).lean<Record<string, any>>();
  if (!u) throw notFound('Unit not found');
  assertCentre(m, u.bankId);
  const r = await Batch.updateOne({ _id: id, status: { $in: ['quarantine', 'available'] } }, { $set: { status: 'discarded', discardReason: reason } });
  if (!r.modifiedCount) throw conflict(`A ${u.status} unit cannot be discarded`);
  await audit(m.name, `Discarded unit: ${reason}`, id);
}

export async function transfer(m: Me, id: string, toBank: string) {
  const u = await Batch.findById(id).lean<Record<string, any>>();
  if (!u) throw notFound('Unit not found');
  assertCentre(m, u.bankId);
  const dest = await Bank.findById(toBank, { name: 1, verified: 1 }).lean<{ name: string; verified: boolean }>();
  if (!dest?.verified) throw notFound('Destination centre not found or not verified');
  if (toBank === u.bankId) throw badRequest('Unit is already at that centre');
  const r = await Batch.updateOne({ _id: id, status: 'available' }, { $set: { bankId: toBank, source: 'Transfer' } });
  if (!r.modifiedCount) throw conflict('Only available units can be transferred');
  await audit(m.name, `Transferred unit to ${dest.name}`, id);
}
