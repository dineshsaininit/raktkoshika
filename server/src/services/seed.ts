import bcrypt from 'bcryptjs';
import { DEMO_ACCOUNTS } from '../../../src/data/demoAccounts.ts';
import { makeSeed } from '../../../src/data/seed.ts';
import { one, q, tx } from '../db.ts';
import { TABLES } from '../db/schema.ts';

const iso = (days: number, hours = 0) => new Date(Date.now() + days * 864e5 + hours * 36e5).toISOString();

/** Inserts many rows with one statement per chunk. `cols` are column names, `rows` arrays of values in the same order. */
async function insert(c: Parameters<typeof q>[2], table: string, cols: string[], rows: unknown[][]) {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const params: unknown[] = [];
    const values = chunk.map((r) => `(${r.map((v) => { params.push(v ?? null); return `$${params.length}`; }).join(',')})`).join(',');
    await q(`insert into ${table} (${cols.join(',')}) values ${values}`, params, c);
  }
}

/**
 * Wipes every table and loads the sample network: the same data the browser-only demo starts with
 * (src/data/seed.ts), plus extra sign-ins so each portal can be tested with more than one account.
 * All centres, people and records are fictional.
 */
export async function seedDatabase() {
  const d = makeSeed();
  const hashes = await Promise.all(DEMO_ACCOUNTS.map((a) => bcrypt.hash(a.password, 10)));

  // Extra sample records for the second centre login (Miraj Civic, b2) and the second patient (u2).
  d.donations.unshift(
    { id: 'D-850', donorId: 'd9', donorName: 'Suresh Pawar', group: 'B+', bankId: 'b2', date: iso(0, 4), slot: '1:00 pm', status: 'booked' },
    { id: 'D-851', donorId: 'd10', donorName: 'Anita Gaikwad', group: 'O-', bankId: 'b2', date: iso(1), slot: '10:30 am', status: 'booked' },
  );
  d.accounts.push(
    { id: 'A-b2-1', bankId: 'b2', at: iso(-2), kind: 'income', head: 'Processing charges, red cells', amount: 98200 },
    { id: 'A-b2-2', bankId: 'b2', at: iso(-3), kind: 'expense', head: 'Test kits (screening, grouping)', amount: 31400 },
    { id: 'A-b2-3', bankId: 'b2', at: iso(-4), kind: 'expense', head: 'Electricity & cold chain upkeep', amount: 9200 },
  );
  d.referrals.push({ id: 'r6', bankId: 'b2', name: 'Miraj Mission Hospital', kind: 'Hospital', city: 'Miraj', plan: 'Yearly', units: 287, status: 'active', contact: 'Dr. N. Kulkarni' });
  d.sensors.push(
    { id: 'S5', bankId: 'b2', name: 'Blood fridge 1', kind: 'Red cells', temp: 3.8, min: 2, max: 6 },
    { id: 'S6', bankId: 'b2', name: 'Plasma freezer', kind: 'Plasma', temp: -36, min: -60, max: -30 },
  );
  d.wallets.b2 = { ownerId: 'b2', balance: 64200, held: 0, credits: 0, creditsHeld: 0, ledger: [{ id: 'L-b2-1', at: iso(-1), kind: 'settlement', amount: 3100, credits: 0, note: 'Received, order RK-20355', ref: 'RK-20355' }] };
  d.wallets.u2 = { ownerId: 'u2', balance: 2000, held: 0, credits: 0, creditsHeld: 0, ledger: [{ id: 'L-u2-1', at: iso(-1), kind: 'topup', amount: 2000, credits: 0, note: 'Added via UPI (test payment)' }] };
  const support = d.threads.find((t) => t.id === 'T-3');
  if (support) support.members = DEMO_ACCOUNTS.map((a) => a.id);
  d.threads.push({ id: 'T-6', title: 'Raktkoshika HQ', subtitle: 'Centre onboarding', kind: 'direct', members: ['b2', 'a1'], messages: [
    { id: 'm9', from: 'a1', text: 'Welcome to the network. Please keep stock updated at least every 30 minutes.', at: iso(-2) },
  ] });
  d.notices.push({ id: 'N9', to: 'bank', title: '2 donors booked for today', body: 'Suresh Pawar (B+) and Anita Gaikwad (O−).', at: iso(0, -1), read: false, link: 'donors', tone: 'info' });

  // Notices addressed to one portal belong to that portal's main sample account.
  const owner: Record<string, string | undefined> = { bank: 'b1', user: 'u1', referral: 'r1', franchise: 'f1' };

  return tx(async (c) => {
    await q(`truncate ${TABLES.join(', ')} restart identity cascade`, [], c);

    await insert(c, 'users', ['id', 'role', 'name', 'org', 'initials', 'phone', 'password_hash', 'bank_id'],
      DEMO_ACCOUNTS.map((a, i) => [a.id, a.role, a.name, a.org, a.initials, a.phone, hashes[i], a.role === 'bank' ? a.id : null]));

    // Parents first, so branch centres can point at them.
    const banks = [...d.banks].sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId));
    await insert(c, 'banks', ['id', 'name', 'city', 'district', 'type', 'license', 'km', 'rating', 'open24', 'verified', 'sync_min', 'parent_id', 'phone', 'created_at'],
      banks.map((b, i) => [b.id, b.name, b.city, b.district, b.type, b.license, b.km, b.rating, b.open24, b.verified, b.syncMin, b.parentId, b.phone, iso(-400 + i)]));

    await insert(c, 'orders', ['id', 'owner_id', 'kind', 'urgency', 'patient_name', 'patient_age', 'hospital', 'ward', 'doctor', 'grp', 'component', 'units', 'bank_id',
      'scheduled_for', 'series_id', 'fulfilment', 'rx', 'stage', 'pay_method', 'fee', 'total', 'credits_used', 'cash', 'settled', 'reaction', 'created_at'],
    d.orders.map((o) => [o.id, o.ownerId, o.kind, o.urgency, o.patient.name, o.patient.age, o.patient.hospital, o.patient.ward, o.patient.doctor, o.group, o.component,
      o.units, o.bankId, o.scheduledFor, o.seriesId, o.fulfilment, o.rx, o.stage, o.payment.method, o.payment.fee, o.payment.total, o.payment.creditsUsed,
      o.payment.cash, o.payment.settled, o.reaction, o.events[0]?.at]));
    await insert(c, 'order_events', ['order_id', 'stage', 'at', 'note'], d.orders.flatMap((o) => o.events.map((e) => [o.id, e.stage, e.at, e.note])));

    await insert(c, 'batches', ['id', 'bank_id', 'grp', 'component', 'collected', 'expiry', 'status', 'source', 'order_id', 'discard_reason'],
      d.batches.map((b) => [b.id, b.bankId, b.group, b.component, b.collected, b.expiry, b.status, b.source, b.orderId, b.discardReason]));

    const wallets = Object.values(d.wallets);
    await insert(c, 'wallets', ['owner_id', 'balance', 'held', 'credits', 'credits_held'], wallets.map((w) => [w.ownerId, w.balance, w.held, w.credits, w.creditsHeld]));
    await insert(c, 'ledger', ['id', 'owner_id', 'at', 'kind', 'amount', 'credits', 'note', 'ref'],
      wallets.flatMap((w) => w.ledger.map((l) => [l.id, w.ownerId, l.at, l.kind, l.amount, l.credits, l.note, l.ref])));

    const p = d.profile;
    await insert(c, 'profiles', ['id', 'name', 'phone', 'city', 'grp', 'age', 'weight', 'sex', 'last_donation', 'donor_active', 'rare_donor', 'share_contact'], [
      [p.id, p.name, p.phone, p.city, p.group, p.age, p.weight, p.sex, p.lastDonation, p.donorActive, p.rareDonor, p.shareContact],
      ['u2', 'Arjun Deshmukh', '+91 90••• ••006', 'Sangli', 'B+', 31, 72, 'M', iso(-200), true, false, false],
    ]);
    await insert(c, 'family_members', ['id', 'profile_id', 'name', 'relation', 'grp'], [
      ...p.family.map((f) => [f.id, p.id, f.name, f.relation, f.group]),
      ['F-u2-1', 'u2', 'Kavya Deshmukh', 'Daughter', 'B+'],
    ]);

    await insert(c, 'camps', ['id', 'org', 'requested_by', 'venue', 'city', 'date', 'target', 'bank_ids', 'accepted_by', 'status', 'registered', 'collected'],
      d.camps.map((k) => [k.id, k.org, k.requestedBy, k.venue, k.city, k.date, k.target, k.bankIds, k.acceptedBy, k.status, k.registered, k.collected]));
    await insert(c, 'donations', ['id', 'donor_id', 'donor_name', 'grp', 'bank_id', 'date', 'slot', 'status', 'hb', 'note', 'camp_id'],
      d.donations.map((x) => [x.id, x.donorId, x.donorName, x.group, x.bankId, x.date, x.slot, x.status, x.hb, x.note, x.campId]));
    await insert(c, 'donor_requests', ['id', 'by_id', 'by_name', 'grp', 'units', 'hospital', 'city', 'needed_by', 'note', 'fee_support', 'responders', 'status', 'broadcast', 'created_at'],
      d.requests.map((r, i) => [r.id, r.byId, r.byName, r.group, r.units, r.hospital, r.city, r.neededBy, r.note, r.feeSupport, r.responders, r.status, !!r.broadcast, iso(0, -i)]));

    await insert(c, 'threads', ['id', 'title', 'subtitle', 'kind', 'members', 'updated_at'],
      d.threads.map((t) => [t.id, t.title, t.subtitle, t.kind, t.members, t.messages.at(-1)?.at ?? iso(-5)]));
    await insert(c, 'messages', ['id', 'thread_id', 'from_id', 'text', 'at'], d.threads.flatMap((t) => t.messages.map((m) => [m.id, t.id, m.from, m.text, m.at])));
    await insert(c, 'notices', ['id', 'to_role', 'title', 'body', 'at', 'read', 'link', 'tone', 'owner_id'],
      d.notices.map((n) => [n.id, n.to, n.title, n.body, n.at, n.read, n.link, n.tone, n.id === 'N9' ? 'b2' : owner[n.to]]));

    await insert(c, 'referrals', ['id', 'bank_id', 'name', 'kind', 'city', 'plan', 'units', 'status', 'contact'],
      d.referrals.map((r) => [r.id, r.bankId, r.name, r.kind, r.city, r.plan, r.units, r.status, r.contact]));
    await insert(c, 'account_entries', ['id', 'bank_id', 'at', 'kind', 'head', 'amount', 'ref'], d.accounts.map((a) => [a.id, a.bankId, a.at, a.kind, a.head, a.amount, a.ref]));
    await insert(c, 'applications', ['id', 'name', 'city', 'district', 'license', 'docs', 'franchise_id', 'status', 'at', 'type'],
      d.applications.map((a) => [a.id, a.name, a.city, a.district, a.license, JSON.stringify(a.docs), a.franchiseId, a.status, a.at, a.type]));
    await insert(c, 'leads', ['id', 'name', 'city', 'contact', 'stage', 'plan'], d.leads.map((l) => [l.id, l.name, l.city, l.contact, l.stage, l.plan]));
    await insert(c, 'tickets', ['id', 'from_org', 'subject', 'priority', 'status', 'at'], d.tickets.map((t) => [t.id, t.from, t.subject, t.priority, t.status, t.at]));
    await insert(c, 'audit', ['id', 'at', 'actor', 'action', 'target'], d.audit.map((a) => [a.id, a.at, a.actor, a.action, a.target]));
    await insert(c, 'plans', ['id', 'owner_id', 'patient', 'grp', 'component', 'units', 'every_days', 'bank_id', 'next', 'active'],
      d.plans.map((x) => [x.id, x.ownerId, x.patient, x.group, x.component, x.units, x.everyDays, x.bankId, x.next, x.active]));
    await insert(c, 'month_stats', ['idx', 'm', 'collected', 'issued'], d.months.map((x, i) => [i, x.m, x.collected, x.issued]));
    await insert(c, 'sensors', ['id', 'bank_id', 'name', 'kind', 'temp', 'min', 'max'], d.sensors.map((s) => [s.id, s.bankId, s.name, s.kind, s.temp, s.min, s.max]));

    return { accounts: DEMO_ACCOUNTS.length, banks: d.banks.length, batches: d.batches.length, orders: d.orders.length };
  });
}

export async function isEmpty() {
  return !(await one('select 1 from users limit 1'));
}
