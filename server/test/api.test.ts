/**
 * End-to-end API tests against a real Postgres. They WIPE the database they use, so they never run on
 * DATABASE_URL: they use TEST_DATABASE_URL, or the same server with the database name `<name>_test`.
 * Run: npm test
 */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { DEMO_ACCOUNTS } from '../../src/data/demoAccounts.ts';
import { createApp } from '../src/app.ts';
import { connectDb, disconnectDb, one, q } from '../src/db.ts';
import { seedDatabase } from '../src/services/seed.ts';

const main = process.env.DATABASE_URL ?? '';
const testUrl = process.env.TEST_DATABASE_URL ?? main.replace(/\/([^/?]+)(\?|$)/, (_m, name: string, q: string) => `/${name}_test${q}`);
if (!testUrl || testUrl === main) throw new Error('Set TEST_DATABASE_URL to a separate database. Tests wipe the database they run on.');

const app = createApp();
const tokens: Record<string, string> = {};
const as = (id: string) => ({ Authorization: `Bearer ${tokens[id]}` });
const order = (over: Record<string, unknown> = {}) => ({
  kind: 'order', urgency: 'routine', patient: { name: 'Anil', age: 58, hospital: 'Sanjeevani', ward: 'ICU', doctor: 'Dr. Joshi' },
  group: 'O+', component: 'PRBC', units: 1, bankId: 'b1', fulfilment: 'collect', rx: 'rx.pdf', method: 'wallet', creditsToUse: 0, ...over,
});
const dbOf = async (id: string) => (await request(app).get('/api/db').set(as(id))).body;

before(async () => {
  await connectDb(testUrl);
  await seedDatabase();
  for (const a of DEMO_ACCOUNTS) {
    const r = await request(app).post('/api/auth/login').send({ phone: a.phone, password: a.password });
    assert.equal(r.status, 200, `${a.id}: ${r.text}`);
    tokens[a.id] = r.body.token;
  }
});
after(async () => { await disconnectDb(); });

describe('schema and seed', () => {
  it('creates every table and loads the sample network', async () => {
    const t = await one<{ n: number }>(`select count(*)::int as n from information_schema.tables where table_schema = 'public'`);
    assert.ok(t!.n >= 25, `tables: ${t!.n}`);
    assert.equal((await one<{ n: number }>('select count(*)::int as n from users'))!.n, DEMO_ACCOUNTS.length);
  });
});

describe('auth', () => {
  it('rejects requests without a token', async () => {
    assert.equal((await request(app).get('/api/db')).status, 401);
  });
  it('rejects a wrong password', async () => {
    assert.equal((await request(app).post('/api/auth/login').send({ phone: '9000000002', password: 'nope' })).status, 401);
  });
  it('accepts formatted phone numbers', async () => {
    const r = await request(app).post('/api/auth/login').send({ phone: '+91 90000 00002', password: 'Centre@123' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.user.role, 'bank');
  });
  it('keeps password-free demo sign-in off by default', async () => {
    assert.equal((await request(app).post('/api/auth/demo').send({ role: 'admin' })).status, 403);
  });
  it('registers a new donor who sees only their own data', async () => {
    const r = await request(app).post('/api/auth/register').send({ name: 'Test Donor', phone: '9811111111', password: 'longenough', city: 'Sangli', group: 'A+', sex: 'M', age: 30, weight: 70 });
    assert.equal(r.status, 201, r.text);
    const db = (await request(app).get('/api/db').set({ Authorization: `Bearer ${r.body.token}` })).body;
    assert.equal(db.profile.name, 'Test Donor');
    assert.equal(db.orders.length, 0);
    assert.equal((await request(app).post('/api/auth/register').send({ name: 'Again', phone: '9811111111', password: 'longenough', city: 'Sangli', group: 'A+', sex: 'M', age: 30, weight: 70 })).status, 409);
  });
});

describe('privacy', () => {
  it('patients see only their own orders and wallet', async () => {
    const db = await dbOf('u1');
    assert.deepEqual(Object.keys(db.wallets), ['u1']);
    assert.ok(db.orders.every((o: { ownerId: string }) => o.ownerId === 'u1'));
    assert.equal(db.wallets.u1.held, 3100);
    assert.equal(db.audit.length, 0);
  });
  it('a franchise sees no patient orders or donor records', async () => {
    const db = await dbOf('f1');
    assert.equal(db.orders.length, 0);
    assert.equal(db.donations.length, 0);
    assert.ok(db.leads.length > 0);
  });
  it('a hospital sees no donor records', async () => {
    assert.equal((await dbOf('r1')).donations.length, 0);
  });
  it('a centre sees only its own centres', async () => {
    const b2 = await dbOf('b2');
    assert.ok(b2.orders.length > 0);
    assert.ok(b2.orders.every((o: { bankId: string }) => o.bankId === 'b2'));
    assert.ok(b2.accounts.every((a: { bankId: string }) => a.bankId === 'b2'));
  });
  it('only admin can reset the database', async () => {
    assert.equal((await request(app).post('/api/admin/reset').set(as('u1'))).status, 403);
  });
});

describe('order lifecycle', () => {
  let id = '';
  it('places an order and holds the money', async () => {
    const r = await request(app).post('/api/orders').set(as('u1')).send(order());
    assert.equal(r.status, 201, r.text);
    id = r.body.id;
    assert.equal(r.body.payment.cash, 1550);
    const w = (await dbOf('u1')).wallets.u1;
    assert.equal(w.balance, 3500 - 1550);
    assert.equal(w.held, 3100 + 1550);
  });
  it('refuses an order larger than the wallet', async () => {
    assert.equal((await request(app).post('/api/orders').set(as('u1')).send(order({ units: 9 }))).status, 402);
  });
  it('two orders racing for the same money cannot both win', async () => {
    // u2 has ₹2,000. Two ₹1,550 orders at the same moment: exactly one may succeed.
    const [a, b] = await Promise.all([1, 2].map(() => request(app).post('/api/orders').set(as('u2')).send(order({ patient: { name: 'Race', age: 30, hospital: 'H', ward: 'W', doctor: 'D' } }))));
    assert.deepEqual([a.status, b.status].sort(), [201, 402]);
    assert.equal((await dbOf('u2')).wallets.u2.balance, 450);
  });
  it('only its own centre can advance it', async () => {
    assert.equal((await request(app).post(`/api/orders/${id}/advance`).set(as('u1'))).status, 403);
    assert.equal((await request(app).post(`/api/orders/${id}/advance`).set(as('b2'))).status, 403);
  });
  it('a double click runs a step only once', async () => {
    const [a, b] = await Promise.all([1, 2].map(() => request(app).post(`/api/orders/${id}/advance`).set(as('b1'))));
    assert.equal([a, b].filter((r) => r.status === 200).length, 2, 'both succeed in sequence because the row is locked');
    const o = (await request(app).get(`/api/orders/${id}`).set(as('u1'))).body;
    assert.equal(o.stage, 'sample_received');
    assert.equal(o.events.length, 3);
  });
  it('walks through the rest and settles on issue', async () => {
    for (const stage of ['crossmatched', 'issued', 'completed']) {
      const r = await request(app).post(`/api/orders/${id}/advance`).set(as('b1'));
      assert.equal(r.status, 200, r.text);
      assert.equal(r.body.stage, stage);
    }
    assert.equal((await dbOf('u1')).wallets.u1.held, 3100);
    const b = await dbOf('b1');
    assert.equal(b.wallets.b1.balance, 186400 + 1550);
    assert.equal(b.batches.filter((x: { orderId?: string; status: string }) => x.orderId === id && x.status === 'issued').length, 1);
    assert.ok(b.accounts.some((a: { ref?: string }) => a.ref === id));
  });
  it('allocates the unit closest to expiry', async () => {
    const b = await dbOf('b1');
    const issued = b.batches.find((x: { orderId?: string }) => x.orderId === id);
    const left = b.batches.filter((x: { bankId: string; group: string; component: string; status: string }) => x.bankId === 'b1' && x.group === 'O+' && x.component === 'PRBC' && x.status === 'available');
    assert.ok(left.every((x: { expiry: string }) => x.expiry >= issued.expiry));
  });
  it('cannot advance past handover or cancel a closed order', async () => {
    assert.equal((await request(app).post(`/api/orders/${id}/advance`).set(as('b1'))).status, 409);
    assert.equal((await request(app).post(`/api/orders/${id}/cancel`).set(as('u1')).send({ reason: 'x' })).status, 409);
  });
  it('cancelling returns held money', async () => {
    const r = await request(app).post('/api/orders/RK-20418/cancel').set(as('u1')).send({ reason: 'Patient shifted' });
    assert.equal(r.status, 200, r.text);
    const w = (await dbOf('u1')).wallets.u1;
    assert.equal(w.held, 0);
    assert.equal(w.balance, 3500 - 1550 + 3100);
  });
  it('declining returns credits too', async () => {
    const r = await request(app).post('/api/orders').set(as('u1')).send(order({ creditsToUse: 1 }));
    assert.equal(r.status, 201, r.text);
    assert.equal((await dbOf('u1')).wallets.u1.credits, 1);
    assert.equal((await request(app).post(`/api/orders/${r.body.id}/reject`).set(as('b1')).send({ reason: 'No stock' })).status, 200);
    const w = (await dbOf('u1')).wallets.u1;
    assert.equal(w.credits, 2);
    assert.equal(w.creditsHeld, 0);
  });
});

describe('prescription files', () => {
  it('uploads a prescription, attaches it to an order, and only the right people can open it', async () => {
    const pdf = Buffer.from('%PDF-1.4\n% sample prescription\n').toString('base64');
    const f = await request(app).post('/api/files').set(as('u1')).send({ name: 'rx.pdf', mime: 'application/pdf', data: pdf });
    assert.equal(f.status, 201, f.text);
    const o = await request(app).post('/api/orders').set(as('u1')).send(order({ rx: 'rx.pdf', rxFileId: f.body.id, method: 'counter' }));
    assert.equal(o.status, 201, o.text);
    assert.equal((await request(app).get(`/api/files/${f.body.id}`).set(as('u1'))).status, 200);
    assert.equal((await request(app).get(`/api/files/${f.body.id}`).set(as('b1'))).status, 200);
    assert.equal((await request(app).get(`/api/files/${f.body.id}`).set(as('b2'))).status, 403);
    assert.equal((await request(app).get(`/api/files/${f.body.id}`).set(as('r1'))).status, 403);
    assert.equal((await request(app).post('/api/files').set(as('u1')).send({ name: 'x.exe', mime: 'application/x-msdownload', data: pdf })).status, 400);
  });
});

describe('donations and stock', () => {
  it('records a donation, quarantines units and gives a credit', async () => {
    const r = await request(app).post('/api/donations/D-841/record').set(as('b1')).send({ hb: 13.5 });
    assert.equal(r.status, 200, r.text);
    const db = await dbOf('b1');
    const q = db.batches.filter((b: { status: string; bankId: string }) => b.status === 'quarantine' && b.bankId === 'b1');
    assert.ok(q.length >= 4);
    const rel = await request(app).post('/api/stock/release').set(as('b1')).send({ ids: q.map((b: { id: string }) => b.id) });
    assert.equal(rel.body.released, q.length);
  });
  it('defers a donor with low haemoglobin', async () => {
    assert.equal((await request(app).post('/api/donations/D-842/record').set(as('b1')).send({ hb: 11 })).status, 200);
  });
  it('a centre cannot record another centre’s donor', async () => {
    assert.equal((await request(app).post('/api/donations/D-850/record').set(as('b1')).send({ hb: 13 })).status, 403);
    assert.equal((await request(app).post('/api/donations/D-850/record').set(as('b2')).send({ hb: 13 })).status, 200);
  });
  it('enforces the donation gap and one booking at a time', async () => {
    const r = await request(app).post('/api/donations').set(as('u1')).send({ bankId: 'b1', date: new Date().toISOString(), slot: '10:00 am' });
    assert.equal(r.status, 201, r.text);
    assert.equal((await request(app).post('/api/donations').set(as('u1')).send({ bankId: 'b1', date: new Date().toISOString(), slot: '11:00 am' })).status, 409);
  });
});

describe('community and ops', () => {
  it('chat, broadcast, camp, ticket', async () => {
    assert.equal((await request(app).post('/api/threads/T-1/messages').set(as('u1')).send({ text: 'Thanks!' })).status, 201);
    assert.equal((await request(app).post('/api/threads/T-5/messages').set(as('u1')).send({ text: 'Not my chat' })).status, 404);
    assert.equal((await request(app).post('/api/broadcasts').set(as('b1')).send({ group: 'O-', city: 'Sangli', note: 'Need O− donors' })).status, 201);
    assert.equal((await request(app).post('/api/camps/C-71/respond').set(as('b1')).send({ status: 'accepted' })).status, 200);
    assert.equal((await request(app).post('/api/tickets').set(as('f1')).send({ subject: 'Help' })).status, 201);
  });
  it('approves only complete applications, once', async () => {
    assert.equal((await request(app).post('/api/applications/AP-24/decision').set(as('a1')).send({ status: 'approved' })).status, 409);
    assert.equal((await request(app).post('/api/applications/AP-23/decision').set(as('a1')).send({ status: 'approved' })).status, 200);
    assert.equal((await request(app).post('/api/applications/AP-23/decision').set(as('a1')).send({ status: 'approved' })).status, 409);
    assert.equal((await request(app).patch('/api/leads/LD1').set(as('f1')).send({ stage: 'Live' })).status, 403);
  });
  it('validates input', async () => {
    const r = await request(app).post('/api/wallet/topup').set(as('u1')).send({ amount: -5, method: 'UPI' });
    assert.equal(r.status, 400);
    assert.ok(Array.isArray(r.body.details));
  });
  it('public stock needs no sign-in and hides licence numbers', async () => {
    const r = await request(app).get('/api/public/snapshot');
    assert.equal(r.status, 200);
    assert.ok(r.body.banks.length > 0 && r.body.batches.length > 0);
    assert.ok(r.body.batches.every((b: { status: string }) => b.status === 'available'));
    assert.ok(r.body.banks.every((b: { license: string }) => b.license === ''));
  });
  it('admin can restore the sample data', async () => {
    const r = await request(app).post('/api/admin/reset').set(as('a1'));
    assert.equal(r.status, 200, r.text);
  });
});

describe('government directory', () => {
  // The directory survives sample-data resets, so clear rows left by earlier test runs.
  before(async () => { await q("delete from directory_centres where source like 'test%'"); });
  // Fictional rows in the National Health Portal's column format, including a quoted comma.
  const nhp = [
    'Sr No,Blood Bank Name,State,District,City,Address,Pincode,Contact No,Mobile,Email,Category,Blood Component Available,Apheresis,Service Time,License #,Latitude,Longitude',
    '1,TEST CITY BLOOD CENTRE,MAHARASHTRA,SANGLI,Sangli,"Station Road, Sangli",416416,0233-000000,9000011111,test@example.org,Govt.,YES,NO,24x7,MH/BB/SGL/0142,16.85,74.58',
    '2,Test Rural Blood Centre,Maharashtra,Satara,Karad,Main Road,415110,,,,Charitable,NO,NO,9 am - 5 pm,TEST-LIC-2,0,0',
    '3,,Maharashtra,Pune,Pune,Missing name row,411001,,,,Private,YES,YES,24x7,TEST-LIC-3,18.5,73.8',
  ].join('\r\n');
  it('only admin can import', async () => {
    assert.equal((await request(app).post('/api/admin/directory/import').set(as('f1')).send({ text: nhp, source: 'test' })).status, 403);
  });
  it('checks a file without saving (dry run), then imports it', async () => {
    const dry = await request(app).post('/api/admin/directory/import').set(as('a1')).send({ text: nhp, source: 'test', dryRun: true });
    assert.equal(dry.status, 200, dry.text);
    assert.equal(dry.body.total, 2);
    assert.equal(dry.body.skipped, 1);
    const none = await request(app).get('/api/public/directory?q=Test%20City');
    assert.equal(none.body.total, 0, none.text);
    const r = await request(app).post('/api/admin/directory/import').set(as('a1')).send({ text: nhp, source: 'test' });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.body.states, ['Maharashtra']);
  });
  it('explains a file with the wrong columns', async () => {
    const r = await request(app).post('/api/admin/directory/import').set(as('a1')).send({ text: 'foo,bar\n1,2', source: 'bad' });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /name/);
  });
  it('is searchable by anyone, by state, district and name', async () => {
    const states = (await request(app).get('/api/public/directory/states')).body;
    assert.ok(states.some((s: { state: string }) => s.state === 'Maharashtra'));
    const d = (await request(app).get('/api/public/directory/districts?state=maharashtra')).body;
    assert.deepEqual(d.map((x: { district: string }) => x.district).sort(), ['Sangli', 'Satara']);
    const s = (await request(app).get('/api/public/directory?state=Maharashtra&district=Sangli')).body;
    assert.equal(s.total, 1);
    const c = s.rows[0];
    assert.equal(c.name, 'Test City Blood Centre');
    assert.equal(c.address, 'Station Road, Sangli');
    assert.equal(c.components, true);
    assert.equal(c.apheresis, false);
    assert.equal(c.lat, 16.85);
    assert.equal(c.onNetwork, 'b1', 'matched to the network centre with the same licence');
    const rural = (await request(app).get('/api/public/directory?q=Rural')).body.rows[0];
    assert.equal(rural.lat, null, 'zero coordinates are treated as missing');
  });
  it('re-importing the same source replaces it, and a sample-data reset keeps it', async () => {
    await request(app).post('/api/admin/directory/import').set(as('a1')).send({ text: nhp, source: 'test' });
    assert.equal((await request(app).get('/api/public/directory?q=Test')).body.total, 2);
    await request(app).post('/api/admin/reset').set(as('a1'));
    assert.equal((await request(app).get('/api/public/directory?q=Test')).body.total, 2);
  });
  it('fills in the state for single-state SBTC files and matches licences for HQ', async () => {
    const sbtc = 'Name of Blood Centre,District,Licence No,Type\nTest Taluka Blood Centre,Kolhapur,KOP/TEST/9,Charitable';
    const r = await request(app).post('/api/admin/directory/import').set(as('a1')).send({ text: sbtc, source: 'test-sbtc', defaultState: 'Maharashtra' });
    assert.equal(r.status, 200, r.text);
    const m = (await request(app).get('/api/admin/directory/licence?license=kop/test/9').set(as('a1'))).body.match;
    assert.equal(m.name, 'Test Taluka Blood Centre');
    assert.equal((await request(app).get('/api/admin/directory/licence?license=NOPE').set(as('a1'))).body.match, null);
  });
});
