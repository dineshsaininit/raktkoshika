import type { BloodGroup, Component } from '../../../src/data/types.ts';
import { COMPONENTS, MIN_HB, daysUntilEligible, uid } from '../../../src/data/rules.ts';
import { one, q, run, tx } from '../db.ts';
import { assertCentre, type Me } from '../lib/auth.ts';
import { badRequest, conflict, forbidden, notFound, paymentRequired } from '../lib/http.ts';
import { audit, ensureWallet, ledger, notify, roleOf } from '../lib/records.ts';
import { donationOut, profileOut } from '../lib/rows.ts';

/* ---------- Wallet ---------- */

/**
 * Test top-up. There is no payment gateway yet, so the amount is added directly.
 * In production this must run only from the gateway's verified webhook, never from the client.
 */
export async function topUp(m: Me, amount: number, method: string) {
  await tx(async (c) => {
    await ensureWallet(m.id, c);
    await q('update wallets set balance = balance + $2 where owner_id = $1', [m.id, amount], c);
    await ledger(m.id, 'topup', amount, 0, `Added via ${method} (test payment)`, undefined, c);
  });
}

export async function settle(m: Me, amount: number) {
  await tx(async (c) => {
    const changed = await run('update wallets set balance = balance - $2 where owner_id = $1 and balance >= $2', [m.id, amount], c);
    if (!changed) throw paymentRequired('Payout is larger than the available balance');
    await ledger(m.id, 'settlement', -amount, 0, 'Paid out to registered bank account', undefined, c);
    await audit(m.name, 'Requested payout', `₹${amount}`, c);
  });
}

export async function giftCredit(m: Me, member: string) {
  await tx(async (c) => {
    if (!(await one('select 1 from family_members where profile_id = $1 and name = $2', [m.id, member], c))) throw badRequest('Add this person to your family first');
    const changed = await run('update wallets set credits = credits - 1 where owner_id = $1 and credits >= 1', [m.id], c);
    if (!changed) throw paymentRequired('No donor credit available');
    await ledger(m.id, 'credit_gift', 0, -1, `Reserved for family member: ${member}`, undefined, c);
    await audit(m.name, 'Assigned donor credit to family', member, c);
  });
}

/* ---------- Profile ---------- */

export async function getProfile(m: Me) {
  const p = await one('select * from profiles where id = $1', [m.id]);
  if (!p) throw notFound('Profile not found');
  return profileOut(p, await q('select * from family_members where profile_id = $1 order by name', [m.id]));
}

const PROFILE_COLS: Record<string, string> = { name: 'name', city: 'city', group: 'grp', age: 'age', weight: 'weight', sex: 'sex', donorActive: 'donor_active', rareDonor: 'rare_donor', shareContact: 'share_contact' };

export async function updateProfile(m: Me, patch: Record<string, unknown>) {
  const keys = Object.keys(patch).filter((k) => PROFILE_COLS[k]);
  if (keys.length) {
    const sets = keys.map((k, i) => `${PROFILE_COLS[k]} = $${i + 2}`).join(', ');
    if (!(await run(`update profiles set ${sets} where id = $1`, [m.id, ...keys.map((k) => patch[k])]))) throw notFound('Profile not found');
    if (typeof patch.name === 'string' && patch.name.trim()) await run('update users set name = $2 where id = $1', [m.id, patch.name.trim()]);
  }
  return getProfile(m);
}

export async function addFamily(m: Me, name: string, relation: string, group: BloodGroup) {
  if (!(await one('select 1 from profiles where id = $1', [m.id]))) throw notFound('Profile not found');
  await q('insert into family_members (id, profile_id, name, relation, grp) values ($1,$2,$3,$4,$5)', [uid('F'), m.id, name, relation, group]);
  return getProfile(m);
}

/* ---------- Donations ---------- */

export async function bookDonation(m: Me, input: { id?: string; bankId: string; date: string; slot: string; campId?: string }) {
  const p = await getProfile(m);
  const wait = daysUntilEligible({ sex: p.sex, lastDonation: p.lastDonation });
  if (wait > 0) throw conflict(`You can donate again in ${wait} days`);
  const id = await tx(async (c) => {
    if (!(await one('select 1 from banks where id = $1', [input.bankId], c))) throw notFound('Blood centre not found');
    if (await one(`select 1 from donations where donor_id = $1 and status = 'booked'`, [m.id], c)) throw conflict('You already have a slot booked. Cancel it first to pick another.');
    if (input.campId && !(await run(`update camps set registered = registered + 1 where id = $1 and status = 'accepted'`, [input.campId], c))) {
      throw conflict('This camp is not open for registration');
    }
    const id = input.id && !(await one('select 1 from donations where id = $1', [input.id], c)) ? input.id : uid('D');
    await q(`insert into donations (id, donor_id, donor_name, grp, bank_id, date, slot, status, camp_id) values ($1,$2,$3,$4,$5,$6,$7,'booked',$8)`,
      [id, m.id, p.name, p.group, input.bankId, input.date, input.slot, input.campId ?? null], c);
    await notify('bank', 'New donor slot booked', `${p.name} · ${p.group} · ${input.slot}`, 'info', 'donors', input.bankId, c);
    await audit(m.name, 'Booked donation slot', id, c);
    return id;
  });
  return donationOut((await one('select * from donations where id = $1', [id]))!);
}

export async function cancelDonation(m: Me, id: string) {
  await tx(async (c) => {
    const d = await one('select * from donations where id = $1 for update', [id], c);
    if (!d) throw notFound('Booking not found');
    if (d.donor_id !== m.id) throw forbidden();
    if (d.status !== 'booked') throw conflict('Only booked slots can be cancelled');
    await q(`update donations set status = 'cancelled' where id = $1`, [id], c);
    if (d.camp_id) await q('update camps set registered = greatest(registered - 1, 0) where id = $1', [d.camp_id], c);
  });
}

/** Records a donation at the centre. Low haemoglobin defers the donor; otherwise units enter quarantine and the donor earns a credit. */
export async function recordDonation(m: Me, id: string, hb: number) {
  await tx(async (c) => {
    const d = await one('select * from donations where id = $1 for update', [id], c);
    if (!d) throw notFound('Donation not found');
    assertCentre(m, d.bank_id);
    if (d.status !== 'booked') throw conflict(`This donation is already ${d.status}`);
    const donorRole = await roleOf(d.donor_id, c);

    if (hb < MIN_HB) {
      await q(`update donations set status = 'deferred', hb = $2, note = $3 where id = $1`, [id, hb, `Haemoglobin below ${MIN_HB} g/dL`], c);
      if (donorRole === 'user') await notify('user', 'Donation deferred today', 'Your haemoglobin was below the safe limit. Try again after a few weeks of iron-rich meals.', 'warn', 'donate', d.donor_id, c);
      await audit(m.name, 'Deferred donor', id, c);
      return;
    }
    await q(`update donations set status = 'completed', hb = $2, date = now() where id = $1`, [id, hb], c);
    await q('update profiles set last_donation = now() where id = $1', [d.donor_id], c);

    // New units wait in quarantine until screening clears them.
    const source = d.camp_id ? 'Camp' : 'Voluntary';
    for (const comp of ['PRBC', 'FFP'] as Component[]) {
      await q(`insert into batches (id, bank_id, grp, component, collected, expiry, status, source) values ($1,$2,$3,$4, now(), now() + ($5 || ' days')::interval, 'quarantine', $6)`,
        [uid('Q'), d.bank_id, d.grp, comp, String(COMPONENTS[comp].shelfDays), source], c);
    }
    if (d.camp_id) await q('update camps set collected = collected + 1 where id = $1', [d.camp_id], c);

    await ensureWallet(d.donor_id, c);
    await q('update wallets set credits = credits + 1 where owner_id = $1', [d.donor_id], c);
    const bank = await one<{ name: string }>('select name from banks where id = $1', [d.bank_id], c);
    await ledger(d.donor_id, 'credit_earn', 0, 1, `Verified donation at ${bank?.name ?? d.bank_id}`, id, c);
    if (donorRole === 'user') await notify('user', 'Thank you. 1 donor credit added', 'Valid at every centre in the network for 12 months.', 'good', 'wallet', d.donor_id, c);
    await audit(m.name, 'Recorded donation, units in quarantine', id, c);
  });
}

/* ---------- Stock ---------- */

export async function releaseQuarantine(m: Me, ids: string[]) {
  return tx(async (c) => {
    const units = await q<{ id: string; bank_id: string }>('select id, bank_id from batches where id = any($1) for update', [ids], c);
    if (units.length !== ids.length) throw notFound('Some units were not found');
    units.forEach((u) => assertCentre(m, u.bank_id));
    const n = await run(`update batches set status = 'available' where id = any($1) and status = 'quarantine'`, [ids], c);
    await audit(m.name, `Released ${n} unit(s) after screening`, ids[0], c);
    return n;
  });
}

export async function discard(m: Me, id: string, reason: string) {
  await tx(async (c) => {
    const u = await one('select * from batches where id = $1 for update', [id], c);
    if (!u) throw notFound('Unit not found');
    assertCentre(m, u.bank_id);
    if (!['quarantine', 'available'].includes(u.status)) throw conflict(`A ${u.status} unit cannot be discarded`);
    await q(`update batches set status = 'discarded', discard_reason = $2 where id = $1`, [id, reason], c);
    await audit(m.name, `Discarded unit: ${reason}`, id, c);
  });
}

export async function transfer(m: Me, id: string, toBank: string) {
  await tx(async (c) => {
    const u = await one('select * from batches where id = $1 for update', [id], c);
    if (!u) throw notFound('Unit not found');
    assertCentre(m, u.bank_id);
    const dest = await one<{ name: string; verified: boolean }>('select name, verified from banks where id = $1', [toBank], c);
    if (!dest?.verified) throw notFound('Destination centre not found or not verified');
    if (toBank === u.bank_id) throw badRequest('Unit is already at that centre');
    if (u.status !== 'available') throw conflict('Only available units can be transferred');
    await q(`update batches set bank_id = $2, source = 'Transfer' where id = $1`, [id, toBank], c);
    await audit(m.name, `Transferred unit to ${dest.name}`, id, c);
  });
}

/* ---------- Prescription files ---------- */

const MAX_FILE = 3 * 1024 * 1024;
const MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];

export async function saveFile(m: Me, name: string, mime: string, base64: string) {
  if (!MIMES.includes(mime)) throw badRequest('Upload a PDF or a photo (JPG, PNG, WEBP, HEIC)');
  const data = Buffer.from(base64, 'base64');
  if (!data.length) throw badRequest('The file is empty');
  if (data.length > MAX_FILE) throw badRequest('Files must be 3 MB or smaller');
  const id = uid('FILE');
  await q('insert into files (id, owner_id, name, mime, size, data) values ($1,$2,$3,$4,$5,$6)', [id, m.id, name.slice(0, 120), mime, data.length, data]);
  return { id, name, size: data.length };
}

/** The uploader, the centre the order went to, and admins may open a prescription. */
export async function readFile(m: Me, id: string) {
  const f = await one('select * from files where id = $1', [id]);
  if (!f) throw notFound('File not found');
  if (m.role !== 'admin' && f.owner_id !== m.id) {
    const o = await one<{ bank_id: string }>('select bank_id from orders where rx_file_id = $1', [id]);
    if (!o || !(m.role === 'bank' && m.centres.includes(o.bank_id))) throw forbidden();
  }
  return f as { name: string; mime: string; data: Buffer };
}
