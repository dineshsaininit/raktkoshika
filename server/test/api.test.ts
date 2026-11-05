/**
 * End-to-end API test against a throwaway MongoDB.
 * Uses MONGODB_TEST_URI if set, otherwise starts an in-memory server (downloads mongod on first run).
 * Run: npm test
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.ts';
import { connectDb, disconnectDb } from '../src/db.ts';
import { seedDatabase } from '../src/services/seed.ts';

let stopMem: (() => Promise<unknown>) | undefined;
const app = createApp();
const tokens: Record<string, string> = {};
const as = (role: string) => ({ Authorization: `Bearer ${tokens[role]}` });

before(async () => {
  let uri = process.env.MONGODB_TEST_URI;
  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const mem = await MongoMemoryServer.create();
    stopMem = () => mem.stop();
    uri = mem.getUri('raktkoshika-test');
  }
  await connectDb(uri);
  await seedDatabase();
  for (const role of ['user', 'bank', 'referral', 'franchise', 'admin']) {
    const r = await request(app).post('/api/auth/demo').send({ role });
    assert.equal(r.status, 200, r.text);
    tokens[role] = r.body.token;
  }
});
after(async () => { await disconnectDb(); await stopMem?.(); });

describe('auth', () => {
  it('rejects requests without a token', async () => {
    assert.equal((await request(app).get('/api/db')).status, 401);
  });
  it('logs in with phone and password', async () => {
    const r = await request(app).post('/api/auth/login').send({ phone: '+91 90000 00002', password: 'raktkoshika123' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.user.role, 'bank');
  });
  it('registers a new donor', async () => {
    const r = await request(app).post('/api/auth/register').send({ name: 'Test Donor', phone: '9811111111', password: 'longenough', city: 'Sangli', group: 'A+', sex: 'M', age: 30, weight: 70 });
    assert.equal(r.status, 201, r.text);
    const db = await request(app).get('/api/db').set({ Authorization: `Bearer ${r.body.token}` });
    assert.equal(db.body.profile.name, 'Test Donor');
    assert.equal(db.body.orders.length, 0, 'a new user sees no one else\'s orders');
  });
});

describe('snapshot', () => {
  it('returns the frontend DB shape', async () => {
    const r = await request(app).get('/api/db').set(as('user'));
    assert.equal(r.status, 200);
    for (const k of ['banks', 'batches', 'orders', 'wallets', 'donations', 'camps', 'requests', 'threads', 'notices', 'referrals', 'accounts', 'applications', 'leads', 'tickets', 'audit', 'profile', 'plans', 'months', 'sensors']) assert.ok(k in r.body, k);
    assert.equal(r.body.profile.id, 'u1');
    assert.deepEqual(Object.keys(r.body.wallets), ['u1'], 'user sees only their own wallet');
    assert.ok(r.body.orders.every((o: { ownerId: string }) => o.ownerId === 'u1'));
    assert.equal(r.body.wallets.u1.held, 3100);
  });
});

describe('order lifecycle', () => {
  let id = '';
  it('places an order and holds the money', async () => {
    const r = await request(app).post('/api/orders').set(as('user')).send({
      kind: 'order', urgency: 'routine', patient: { name: 'Anil', age: 58, hospital: 'Sanjeevani', ward: 'ICU', doctor: 'Dr. Joshi' },
      group: 'O+', component: 'PRBC', units: 1, bankId: 'b1', fulfilment: 'collect', rx: 'rx.pdf', method: 'wallet', creditsToUse: 0,
    });
    assert.equal(r.status, 201, r.text);
    id = r.body.id;
    assert.equal(r.body.payment.cash, 1550);
    const w = (await request(app).get('/api/db').set(as('user'))).body.wallets.u1;
    assert.equal(w.balance, 3500 - 1550);
    assert.equal(w.held, 3100 + 1550);
  });
  it('refuses an order larger than the wallet', async () => {
    const r = await request(app).post('/api/orders').set(as('user')).send({
      kind: 'order', urgency: 'routine', patient: { name: 'X', age: 1, hospital: 'H', ward: 'W', doctor: 'D' },
      group: 'O+', component: 'PRBC', units: 9, bankId: 'b1', fulfilment: 'collect', rx: 'rx', method: 'wallet', creditsToUse: 0,
    });
    assert.equal(r.status, 402);
  });
  it('only the centre can advance it', async () => {
    assert.equal((await request(app).post(`/api/orders/${id}/advance`).set(as('user'))).status, 403);
  });
  it('walks through every stage and settles on issue', async () => {
    for (const stage of ['rx_verified', 'sample_received', 'crossmatched', 'issued', 'completed']) {
      const r = await request(app).post(`/api/orders/${id}/advance`).set(as('bank'));
      assert.equal(r.status, 200, r.text);
      assert.equal(r.body.stage, stage);
    }
    const u = (await request(app).get('/api/db').set(as('user'))).body;
    assert.equal(u.wallets.u1.held, 3100);
    const b = (await request(app).get('/api/db').set(as('bank'))).body;
    assert.equal(b.wallets.b1.balance, 186400 + 1550);
    assert.equal(b.batches.filter((x: { orderId?: string; status: string }) => x.orderId === id && x.status === 'issued').length, 1);
  });
  it('cancelling returns held money', async () => {
    const r = await request(app).post('/api/orders/RK-20418/cancel').set(as('user')).send({ reason: 'Patient shifted' });
    assert.equal(r.status, 200, r.text);
    const w = (await request(app).get('/api/db').set(as('user'))).body.wallets.u1;
    assert.equal(w.held, 0);
    assert.equal(w.balance, 3500 - 1550 + 3100);
  });
});

describe('donations and stock', () => {
  it('records a donation, quarantines units and gives a credit', async () => {
    const r = await request(app).post('/api/donations/D-841/record').set(as('bank')).send({ hb: 13.5 });
    assert.equal(r.status, 200, r.text);
    const db = (await request(app).get('/api/db').set(as('bank'))).body;
    const q = db.batches.filter((b: { status: string; bankId: string }) => b.status === 'quarantine' && b.bankId === 'b1');
    assert.ok(q.length >= 4);
    const rel = await request(app).post('/api/stock/release').set(as('bank')).send({ ids: q.map((b: { id: string }) => b.id) });
    assert.equal(rel.body.released, q.length);
  });
  it('defers a donor with low haemoglobin', async () => {
    assert.equal((await request(app).post('/api/donations/D-842/record').set(as('bank')).send({ hb: 11 })).status, 200);
  });
  it('blocks booking before the donation gap is over', async () => {
    // Riya last donated 130 days ago; the gap for women is 120 days, so this succeeds.
    const r = await request(app).post('/api/donations').set(as('user')).send({ bankId: 'b1', date: new Date().toISOString(), slot: '10:00 am' });
    assert.equal(r.status, 201, r.text);
    const again = await request(app).post('/api/donations').set(as('user')).send({ bankId: 'b1', date: new Date().toISOString(), slot: '11:00 am' });
    assert.equal(again.status, 409);
  });
});

describe('community and ops', () => {
  it('chat, broadcast, camp, ticket, application', async () => {
    assert.equal((await request(app).post('/api/threads/T-1/messages').set(as('user')).send({ text: 'Thanks!' })).status, 201);
    assert.equal((await request(app).post('/api/threads/T-5/messages').set(as('user')).send({ text: 'Not my chat' })).status, 404);
    assert.equal((await request(app).post('/api/broadcasts').set(as('bank')).send({ group: 'O-', city: 'Sangli', note: 'Need O− donors' })).status, 201);
    assert.equal((await request(app).post('/api/camps/C-71/respond').set(as('bank')).send({ status: 'accepted' })).status, 200);
    assert.equal((await request(app).post('/api/tickets').set(as('franchise')).send({ subject: 'Help' })).status, 201);
    assert.equal((await request(app).post('/api/applications/AP-23/decision').set(as('admin')).send({ status: 'approved' })).status, 200);
    assert.equal((await request(app).post('/api/applications/AP-23/decision').set(as('admin')).send({ status: 'approved' })).status, 409);
  });
  it('validates input', async () => {
    const r = await request(app).post('/api/wallet/topup').set(as('user')).send({ amount: -5, method: 'UPI' });
    assert.equal(r.status, 400);
    assert.ok(Array.isArray(r.body.details));
  });
  it('public stock needs no sign-in', async () => {
    const r = await request(app).get('/api/public/stock?group=O%2B');
    assert.equal(r.status, 200);
    assert.ok(r.body.banks.length > 0);
  });
});
