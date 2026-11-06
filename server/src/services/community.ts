import type { BankType, BloodGroup, Component, LeadStage, Role } from '../../../src/data/types.ts';
import { uid } from '../../../src/data/rules.ts';
import { one, q, run, tx } from '../db.ts';
import { actor, assertCentre, homeCentre, type Me } from '../lib/auth.ts';
import { badRequest, conflict, forbidden, notFound } from '../lib/http.ts';
import { audit, notify } from '../lib/records.ts';
import { accountOut, applicationOut, bankOut, campOut, leadOut, planOut, referralOut, requestOut, ticketOut } from '../lib/rows.ts';

const byId = async <T>(table: string, id: string, out: (r: Record<string, any>) => T) => {
  const r = await one(`select * from ${table} where id = $1`, [id]);
  if (!r) throw notFound();
  return out(r);
};

/* ---------- Camps ---------- */

export async function requestCamp(m: Me, c: { org: string; venue: string; city: string; date: string; target: number; bankIds: string[] }) {
  const found = await q('select id from banks where id = any($1)', [c.bankIds]);
  if (found.length !== new Set(c.bankIds).size) throw badRequest('Unknown blood centre in bankIds');
  const id = uid('C');
  await tx(async (t) => {
    await q(`insert into camps (id, org, requested_by, venue, city, date, target, bank_ids, status) values ($1,$2,$3,$4,$5,$6,$7,$8,'requested')`,
      [id, c.org, m.id, c.venue, c.city, c.date, c.target, c.bankIds], t);
    for (const b of c.bankIds) await notify('bank', 'New camp request', `${c.org} · ${c.city}`, 'info', 'camps', b, t);
    await audit(c.org, 'Requested blood camp', c.city, t);
  });
  return byId('camps', id, campOut);
}

const CAMP_NEXT: Record<string, string[]> = { requested: ['accepted', 'declined'], accepted: ['completed', 'declined'] };

export async function campRespond(m: Me, id: string, status: 'accepted' | 'declined' | 'completed', bankId: string) {
  await tx(async (t) => {
    const c = await one('select * from camps where id = $1 for update', [id], t);
    if (!c) throw notFound('Camp not found');
    assertCentre(m, bankId);
    if (!CAMP_NEXT[c.status]?.includes(status)) throw conflict(`A ${c.status} camp cannot be marked ${status}`);
    if (status === 'accepted' && !c.bank_ids.includes(bankId)) throw forbidden('This camp was not sent to your centre');
    if (status !== 'accepted' && c.accepted_by && !m.centres.includes(c.accepted_by) && m.role !== 'admin') throw forbidden('Another centre is running this camp');
    // Until each camp donation is recorded one by one, closing a camp estimates the units collected.
    const collected = status === 'completed' && !c.collected ? Math.round(c.registered * 0.82) : c.collected;
    await q('update camps set status = $2, accepted_by = coalesce($3, accepted_by), collected = $4 where id = $1', [id, status, status === 'accepted' ? bankId : null, collected], t);
    await audit(m.name, `Camp ${status}`, id, t);
  });
}

/* ---------- Donor requests ---------- */

export async function postRequest(m: Me, r: { group: BloodGroup; units: number; hospital: string; city: string; neededBy: string; note: string; feeSupport: boolean }) {
  const id = uid('DR');
  await q(`insert into donor_requests (id, by_id, by_name, grp, units, hospital, city, needed_by, note, fee_support, status) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open')`,
    [id, m.id, actor(m), r.group, r.units, r.hospital, r.city, r.neededBy, r.note, r.feeSupport]);
  await audit(actor(m), 'Posted donor request', `${r.units} × ${r.group}`);
  return byId('donor_requests', id, requestOut);
}

export async function respond(m: Me, id: string) {
  const n = await run(`update donor_requests set responders = case when $2 = any(responders) then responders else array_append(responders, $2) end where id = $1 and status = 'open'`, [id, m.name]);
  if (!n) throw notFound('Open request not found');
}

export async function closeRequest(m: Me, id: string) {
  const r = await one('select by_id from donor_requests where id = $1', [id]);
  if (!r) throw notFound('Request not found');
  if (r.by_id !== m.id && m.role !== 'admin') throw forbidden('Only the person who posted it can close it');
  await run(`update donor_requests set status = 'fulfilled' where id = $1`, [id]);
}

/* ---------- Chat and notices ---------- */

export async function send(m: Me, threadId: string, text: string) {
  const t = await one('select 1 from threads where id = $1 and $2 = any(members)', [threadId, m.id]);
  if (!t) throw notFound('Conversation not found');
  const msg = { id: uid('m'), from: m.id, text, at: new Date().toISOString() };
  await tx(async (c) => {
    await q('insert into messages (id, thread_id, from_id, text, at) values ($1,$2,$3,$4,$5)', [msg.id, threadId, m.id, text, msg.at], c);
    await q('update threads set updated_at = now() where id = $1', [threadId], c);
  });
  return msg;
}

export async function broadcast(m: Me, group: BloodGroup, city: string, note: string) {
  const by = m.role === 'admin' ? 'Raktkoshika' : m.org;
  await tx(async (c) => {
    // Opted-in donors and partners. A full rollout would filter by city, blood group and the donor-alerts setting.
    const audience = await q<{ id: string }>(`select id from users where role in ('user','referral','admin')`, [], c);
    const tid = uid('T');
    await q(`insert into threads (id, title, subtitle, kind, members) values ($1,$2,'Broadcast to opted-in donors','broadcast',$3)`,
      [tid, `${group.replace('-', '−')} donors · ${city}`, [...new Set([m.id, ...audience.map((u) => u.id)])]], c);
    await q('insert into messages (id, thread_id, from_id, text) values ($1,$2,$3,$4)', [uid('m'), tid, m.id, note], c);
    await q(`insert into donor_requests (id, by_id, by_name, grp, units, hospital, city, needed_by, note, status, broadcast)
      values ($1,$2,$3,$4,5,'Network shortage alert',$5, now() + interval '2 days', $6, 'open', true)`, [uid('DR'), m.id, by, group, city, note], c);
    await notify('user', `${group} donors needed in ${city}`, note, 'warn', 'donor-requests', undefined, c);
    await notify('referral', `${group} shortage in ${city}`, note, 'warn', 'donor-requests', undefined, c);
    await audit(by, 'Sent shortage broadcast', `${group} · ${city}`, c);
  });
}

export async function readNotices(m: Me, role: Role) {
  if (role !== m.role) throw forbidden();
  await run('update notices set read = true where to_role = $1 and (owner_id is null or owner_id = any($2))', [role, [m.id, ...m.centres]]);
}

/* ---------- Blood centre back office ---------- */

export async function addCenter(m: Me, name: string, city: string, license: string) {
  const home = homeCentre(m);
  const parent = await one('select * from banks where id = $1', [home]);
  if (!parent) throw notFound('Your centre record is missing');
  if (await one('select 1 from banks where license = $1', [license])) throw conflict('A centre with this licence number already exists');
  const id = uid('B');
  await q(`insert into banks (id, name, city, district, type, license, km, rating, open24, verified, sync_min, parent_id, phone)
    values ($1,$2,$3,$3,$4,$5,20,5,false,$6,0,$7,$8)`, [id, name, city, parent.type, license, parent.verified, home, parent.phone]);
  await audit(m.name, 'Created centre', name);
  return byId('banks', id, bankOut);
}

export async function addReferral(m: Me, name: string, kind: string, city: string, contact: string) {
  const id = uid('R');
  await q(`insert into referrals (id, bank_id, name, kind, city, contact, plan, units, status) values ($1,$2,$3,$4,$5,$6,'Monthly',0,'invited')`, [id, homeCentre(m), name, kind, city, contact]);
  await audit(m.name, 'Invited referral', name);
  return byId('referrals', id, referralOut);
}

export async function addExpense(m: Me, head: string, amount: number, bankId = homeCentre(m)) {
  assertCentre(m, bankId);
  const id = uid('A');
  await q(`insert into account_entries (id, bank_id, kind, head, amount) values ($1,$2,'expense',$3,$4)`, [id, bankId, head, amount]);
  return byId('account_entries', id, accountOut);
}

/* ---------- Regular transfusion plans ---------- */

export async function addPlan(m: Me, p: { patient: string; group: BloodGroup; component: Component; units: number; everyDays: number; bankId: string; next: string }) {
  if (!(await one('select 1 from banks where id = $1', [p.bankId]))) throw notFound('Blood centre not found');
  const id = uid('T');
  await q('insert into plans (id, owner_id, patient, grp, component, units, every_days, bank_id, next, active) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)',
    [id, m.id, p.patient, p.group, p.component, p.units, p.everyDays, p.bankId, p.next]);
  return byId('plans', id, planOut);
}

export async function togglePlan(m: Me, id: string) {
  const p = await one('select owner_id from plans where id = $1', [id]);
  if (!p) throw notFound('Plan not found');
  if (p.owner_id !== m.id) throw forbidden();
  await run('update plans set active = not active where id = $1', [id]);
}

/* ---------- Franchise and network ops ---------- */

export async function submitApplication(m: Me, a: { name: string; city: string; license: string; type?: BankType }) {
  const id = uid('AP');
  const docs = ['FDA blood centre licence', 'SBTC registration', 'Medical officer registration', 'e-RaktKosh ID'].map((name) => ({ name, ok: true }));
  await q(`insert into applications (id, name, city, district, license, type, franchise_id, status, docs) values ($1,$2,$3,$3,$4,$5,$6,'pending',$7)`,
    [id, a.name, a.city, a.license, a.type ?? 'Charitable', m.id, JSON.stringify(docs)]);
  await notify('admin', 'New centre application', `${a.name} · ${a.city}`, 'warn', 'verification');
  await audit(m.name, 'Submitted centre application', a.name);
  return byId('applications', id, applicationOut);
}

export async function decideApplication(m: Me, id: string, status: 'approved' | 'rejected') {
  await tx(async (c) => {
    const a = await one('select * from applications where id = $1 for update', [id], c);
    if (!a) throw notFound('Application not found');
    if (a.status !== 'pending') throw conflict(`Application is already ${a.status}`);
    if (status === 'approved' && !a.docs.every((d: { ok: boolean }) => d.ok)) throw conflict('Every document must be present before approval');
    await q('update applications set status = $2 where id = $1', [id, status], c);
    if (status === 'approved') {
      if (await one('select 1 from banks where license = $1', [a.license], c)) throw conflict('A centre with this licence number already exists');
      await q(`insert into banks (id, name, city, district, type, license, km, rating, open24, verified, sync_min, phone) values ($1,$2,$3,$4,$5,$6,60,5,false,true,1,'')`,
        [uid('B'), a.name, a.city, a.district, a.type, a.license], c);
      await q(`update leads set stage = 'Live' where name = $1`, [a.name], c);
      await notify('franchise', `${a.name} is live`, 'Licence verified by Raktkoshika.', 'good', 'pipeline', a.franchise_id, c);
    } else await notify('franchise', `${a.name} needs corrections`, 'Upload the missing document and resubmit.', 'warn', 'centres', a.franchise_id, c);
    await audit(m.name, status === 'approved' ? 'Approved centre' : 'Sent back application', a.name, c);
  });
}

export async function addLead(_m: Me, l: { name: string; city: string; contact: string; plan: string }) {
  const id = uid('LD');
  await q(`insert into leads (id, name, city, contact, plan, stage) values ($1,$2,$3,$4,$5,'Lead')`, [id, l.name, l.city, l.contact, l.plan]);
  return byId('leads', id, leadOut);
}

export async function moveLead(_m: Me, id: string, stage: LeadStage) {
  // Going live needs HQ's licence check, which happens through decideApplication.
  if (stage === 'Live') throw forbidden('A centre goes live only after Raktkoshika approves its application');
  if (!(await run('update leads set stage = $2 where id = $1', [id, stage]))) throw notFound('Lead not found');
}

export async function addTicket(m: Me, subject: string) {
  const id = uid('TK');
  await q(`insert into tickets (id, from_org, subject, priority, status) values ($1,$2,$3,'Normal','open')`, [id, m.org, subject]);
  return byId('tickets', id, ticketOut);
}

export async function resolveTicket(_m: Me, id: string) {
  if (!(await run(`update tickets set status = 'resolved' where id = $1`, [id]))) throw notFound('Ticket not found');
}
