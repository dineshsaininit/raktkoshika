import { Router, type Request } from 'express';
import { z } from 'zod';
import { COMPONENT_KEYS, GROUPS } from '../../../src/data/rules.ts';
import { config } from '../config.ts';
import { me, requireAuth, requireRole } from '../lib/auth.ts';
import { bus, emitChange } from '../lib/events.ts';
import { forbidden, parse } from '../lib/http.ts';
import * as C from '../services/community.ts';
import * as O from '../services/orders.ts';
import * as P from '../services/people.ts';
import { seedDatabase } from '../services/seed.ts';
import { publicSnapshot, snapshot } from '../services/snapshot.ts';

export const api = Router();

/* ---------- shared field rules ---------- */
const group = z.enum(GROUPS as [string, ...string[]]) as unknown as z.ZodType<(typeof GROUPS)[number]>;
const component = z.enum(COMPONENT_KEYS as [string, ...string[]]) as unknown as z.ZodType<(typeof COMPONENT_KEYS)[number]>;
const text = (max = 200) => z.string().trim().min(1).max(max);
const id = z.string().trim().min(1).max(40);
const isoDate = z.iso.datetime({ offset: true }).or(z.iso.datetime());
const money = z.number().positive().max(10_00_000).transform(Math.round);
const param = (req: Request) => String(req.params.id);
const ok = { ok: true };

/* ---------- public, no sign-in ---------- */

api.get('/health', (_req, res) => { res.json({ ok: true, time: new Date().toISOString() }); });

/** Stock for the public "find blood" page and landing board: verified centres and in-date available units. */
api.get('/public/snapshot', async (_req, res) => { res.json(await publicSnapshot()); });

/* ---------- everything below needs a session ---------- */

/** Server-sent events: one `change` event per successful write, so open portals refetch. */
api.get('/events', requireAuth, (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(`event: hello\ndata: ${JSON.stringify({ id: me(req).id })}\n\n`);
  const onChange = (e: unknown) => res.write(`event: change\ndata: ${JSON.stringify(e)}\n\n`);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  bus.on('change', onChange);
  req.on('close', () => { clearInterval(ping); bus.off('change', onChange); });
});

api.use(requireAuth);
// Any successful write tells open portals to refresh.
api.use((req, res, next) => {
  if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) emitChange(req.path); });
  next();
});

api.get('/db', async (req, res) => { res.json(await snapshot(me(req))); });

/* ---------- orders ---------- */

const patient = z.object({ name: text(80), age: z.number().int().min(0).max(120), hospital: text(120), ward: text(60), doctor: text(80) });
api.post('/orders', requireRole('user', 'referral'), async (req, res) => {
  const b = parse(z.object({
    id: z.string().regex(/^RK-\d{5,6}$/).optional(), kind: z.enum(['order', 'booking']), urgency: z.enum(['sos', 'routine']), patient,
    group, component, units: z.number().int().min(1).max(10), bankId: id, scheduledFor: isoDate.nullish().transform((v) => v ?? undefined), seriesId: id.optional(),
    fulfilment: z.enum(['collect', 'delivery']), rx: text(200), rxFileId: id.optional(), method: z.enum(['wallet', 'counter']), creditsToUse: z.number().int().min(0).max(10).default(0),
  }), req.body);
  res.status(201).json((await O.placeOrder(me(req), b)));
});
api.get('/orders/:id', async (req, res) => {
  const o = await O.getOrder(param(req));
  O.assertCanSee(me(req), o);
  res.json((o));
});
api.post('/orders/:id/advance', requireRole('bank', 'admin'), async (req, res) => { res.json((await O.advanceOrder(me(req), param(req)))); });
const reason = z.object({ reason: text(300) });
api.post('/orders/:id/reject', requireRole('bank', 'admin'), async (req, res) => {
  res.json((await O.closeOrder(me(req), param(req), 'rejected', parse(reason, req.body).reason)));
});
api.post('/orders/:id/cancel', async (req, res) => {
  res.json((await O.closeOrder(me(req), param(req), 'cancelled', parse(reason, req.body).reason)));
});
api.post('/orders/:id/reaction', requireRole('user', 'referral'), async (req, res) => {
  res.json((await O.reportReaction(me(req), param(req), parse(z.object({ text: text(1000) }), req.body).text)));
});

/* ---------- wallet ---------- */

api.post('/wallet/topup', requireRole('user', 'referral'), async (req, res) => {
  const b = parse(z.object({ amount: money, method: text(40) }), req.body);
  await P.topUp(me(req), b.amount, b.method); res.json(ok);
});
api.post('/wallet/payout', requireRole('bank', 'franchise'), async (req, res) => {
  await P.settle(me(req), parse(z.object({ amount: money }), req.body).amount); res.json(ok);
});
api.post('/wallet/gift-credit', requireRole('user'), async (req, res) => {
  await P.giftCredit(me(req), parse(z.object({ member: text(80) }), req.body).member); res.json(ok);
});

/* ---------- profile ---------- */

api.get('/profile', requireRole('user'), async (req, res) => { res.json((await P.getProfile(me(req)))); });
api.patch('/profile', requireRole('user'), async (req, res) => {
  const patch = parse(z.object({
    name: z.string().trim().max(80), city: z.string().trim().max(60), group, age: z.number().int().min(0).max(120), weight: z.number().min(0).max(250),
    sex: z.enum(['F', 'M']), donorActive: z.boolean(), rareDonor: z.boolean(), shareContact: z.boolean(),
  }).partial().strict(), req.body);
  res.json((await P.updateProfile(me(req), patch) as Record<string, unknown>));
});
api.post('/profile/family', requireRole('user'), async (req, res) => {
  const b = parse(z.object({ name: text(80), relation: text(40), group }), req.body);
  res.status(201).json((await P.addFamily(me(req), b.name, b.relation, b.group) as Record<string, unknown>));
});

/* ---------- donations ---------- */

api.post('/donations', requireRole('user'), async (req, res) => {
  const b = parse(z.object({ id: id.optional(), bankId: id, date: isoDate, slot: text(20), campId: id.optional() }), req.body);
  res.status(201).json((await P.bookDonation(me(req), b) as Record<string, unknown>));
});
api.post('/donations/:id/cancel', requireRole('user'), async (req, res) => { await P.cancelDonation(me(req), param(req)); res.json(ok); });
api.post('/donations/:id/record', requireRole('bank', 'admin'), async (req, res) => {
  await P.recordDonation(me(req), param(req), parse(z.object({ hb: z.number().min(3).max(25) }), req.body).hb); res.json(ok);
});

/* ---------- stock ---------- */

api.post('/stock/release', requireRole('bank', 'admin'), async (req, res) => {
  res.json({ released: await P.releaseQuarantine(me(req), parse(z.object({ ids: z.array(id).min(1).max(200) }), req.body).ids) });
});
api.post('/stock/:id/discard', requireRole('bank', 'admin'), async (req, res) => {
  await P.discard(me(req), param(req), parse(reason, req.body).reason); res.json(ok);
});
api.post('/stock/:id/transfer', requireRole('bank', 'admin'), async (req, res) => {
  await P.transfer(me(req), param(req), parse(z.object({ toBank: id }), req.body).toBank); res.json(ok);
});

/* ---------- camps and donor requests ---------- */

api.post('/camps', async (req, res) => {
  const b = parse(z.object({ org: text(120), venue: text(120), city: text(60), date: isoDate, target: z.number().int().min(1).max(5000), bankIds: z.array(id).min(1).max(50) }), req.body);
  res.status(201).json((await C.requestCamp(me(req), b) as Record<string, unknown>));
});
api.post('/camps/:id/respond', requireRole('bank', 'admin'), async (req, res) => {
  const b = parse(z.object({ status: z.enum(['accepted', 'declined', 'completed']), bankId: id.optional() }), req.body);
  await C.campRespond(me(req), param(req), b.status, b.bankId ?? me(req).id); res.json(ok);
});

api.post('/requests', async (req, res) => {
  const b = parse(z.object({ group, units: z.number().int().min(1).max(20), hospital: text(120), city: text(60), neededBy: isoDate, note: z.string().max(500).default(''), feeSupport: z.boolean().default(false) }), req.body);
  res.status(201).json((await C.postRequest(me(req), b) as Record<string, unknown>));
});
api.post('/requests/:id/respond', async (req, res) => { await C.respond(me(req), param(req)); res.json(ok); });
api.post('/requests/:id/close', async (req, res) => { await C.closeRequest(me(req), param(req)); res.json(ok); });

/* ---------- chat and notices ---------- */

api.post('/threads/:id/messages', async (req, res) => {
  res.status(201).json(await C.send(me(req), param(req), parse(z.object({ text: text(2000) }), req.body).text));
});
api.post('/broadcasts', requireRole('bank', 'admin'), async (req, res) => {
  const b = parse(z.object({ group, city: text(60), note: text(500) }), req.body);
  await C.broadcast(me(req), b.group, b.city, b.note); res.status(201).json(ok);
});
api.post('/notices/read', async (req, res) => { await C.readNotices(me(req), me(req).role); res.json(ok); });

/* ---------- blood centre back office ---------- */

api.post('/bank/centres', requireRole('bank'), async (req, res) => {
  const b = parse(z.object({ name: text(120), city: text(60), license: text(40) }), req.body);
  res.status(201).json((await C.addCenter(me(req), b.name, b.city, b.license) as Record<string, unknown>));
});
api.post('/bank/referrals', requireRole('bank'), async (req, res) => {
  const b = parse(z.object({ name: text(120), kind: z.enum(['Hospital', 'Clinic', 'Doctor', 'Nursing home']), city: text(60), contact: text(80) }), req.body);
  res.status(201).json((await C.addReferral(me(req), b.name, b.kind, b.city, b.contact) as Record<string, unknown>));
});
api.post('/bank/expenses', requireRole('bank'), async (req, res) => {
  const b = parse(z.object({ head: text(120), amount: money, bankId: id.optional() }), req.body);
  res.status(201).json((await C.addExpense(me(req), b.head, b.amount, b.bankId) as Record<string, unknown>));
});

/* ---------- regular transfusion plans ---------- */

api.post('/plans', requireRole('user', 'referral'), async (req, res) => {
  const b = parse(z.object({ patient: text(80), group, component, units: z.number().int().min(1).max(10), everyDays: z.number().int().min(7).max(120), bankId: id, next: isoDate }), req.body);
  res.status(201).json((await C.addPlan(me(req), b) as Record<string, unknown>));
});
api.post('/plans/:id/toggle', requireRole('user', 'referral'), async (req, res) => { await C.togglePlan(me(req), param(req)); res.json(ok); });

/* ---------- franchise and network ops ---------- */

api.post('/applications', requireRole('franchise'), async (req, res) => {
  const b = parse(z.object({ name: text(120), city: text(60), license: text(40), type: z.enum(['Government', 'Charitable', 'Private']).optional() }), req.body);
  res.status(201).json((await C.submitApplication(me(req), b) as Record<string, unknown>));
});
api.post('/applications/:id/decision', requireRole('admin'), async (req, res) => {
  await C.decideApplication(me(req), param(req), parse(z.object({ status: z.enum(['approved', 'rejected']) }), req.body).status); res.json(ok);
});
api.post('/leads', requireRole('franchise', 'admin'), async (req, res) => {
  const b = parse(z.object({ name: text(120), city: text(60), contact: text(80), plan: text(60) }), req.body);
  res.status(201).json((await C.addLead(me(req), b) as Record<string, unknown>));
});
api.patch('/leads/:id', requireRole('franchise', 'admin'), async (req, res) => {
  await C.moveLead(me(req), param(req), parse(z.object({ stage: z.enum(['Lead', 'Demo done', 'Documents', 'Live']) }), req.body).stage); res.json(ok);
});
api.post('/tickets', async (req, res) => {
  res.status(201).json((await C.addTicket(me(req), parse(z.object({ subject: text(200) }), req.body).subject) as Record<string, unknown>));
});
api.post('/tickets/:id/resolve', requireRole('franchise', 'admin'), async (req, res) => { await C.resolveTicket(me(req), param(req)); res.json(ok); });

/* ---------- prescription files ---------- */

api.post('/files', requireRole('user', 'referral'), async (req, res) => {
  const b = parse(z.object({ name: text(120), mime: text(60), data: z.string().min(1).max(4_500_000) }), req.body);
  res.status(201).json(await P.saveFile(me(req), b.name, b.mime, b.data));
});
api.get('/files/:id', async (req, res) => {
  const f = await P.readFile(me(req), param(req));
  res.set({ 'Content-Type': f.mime, 'Content-Disposition': `inline; filename="${encodeURIComponent(f.name)}"`, 'Cache-Control': 'private, max-age=300' });
  res.send(f.data);
});

/** Restores the sample data. Admin only, and only when ALLOW_DEMO_RESET is on. */
api.post('/admin/reset', requireRole('admin'), async (_req, res) => {
  if (!config.allowReset) throw forbidden('Reset is turned off on this server');
  res.json(await seedDatabase());
});
