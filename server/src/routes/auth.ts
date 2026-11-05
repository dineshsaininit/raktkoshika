import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { GROUPS, uid } from '../../../src/data/rules.ts';
import { ME } from '../../../src/data/seed.ts';
import type { Role } from '../../../src/data/types.ts';
import { config } from '../config.ts';
import { me, requireAuth, signToken } from '../lib/auth.ts';
import { conflict, forbidden, parse, unauthorized } from '../lib/http.ts';
import { ensureWallet } from '../lib/records.ts';
import { Profile, User } from '../models/index.ts';

export const auth = Router();
auth.use(rateLimit({ windowMs: 15 * 60_000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false }));

const phone = z.string().trim().transform((s) => s.replace(/\D/g, '').slice(-10)).pipe(z.string().length(10, 'Enter a 10-digit mobile number'));
const publicUser = (u: Record<string, any>) => ({ id: u._id, role: u.role, name: u.name, org: u.org, initials: u.initials, phone: u.phone });

/** Phone + password. Replace with phone + OTP (MSG91, Twilio Verify, Firebase Auth) before launch. */
auth.post('/login', async (req, res) => {
  const b = parse(z.object({ phone, password: z.string().min(1) }), req.body);
  const u = await User.findOne({ phone: b.phone }).lean<Record<string, any>>();
  if (!u?.passwordHash || !(await bcrypt.compare(b.password, u.passwordHash))) throw unauthorized('Wrong mobile number or password');
  res.json({ token: signToken(u as { _id: string; role: Role }), user: publicUser(u) });
});

/** Patient / donor self sign-up. Centres, hospitals and franchises are onboarded by Raktkoshika, not self-registered. */
auth.post('/register', async (req, res) => {
  const b = parse(z.object({
    name: z.string().trim().min(2).max(80), phone, password: z.string().min(8, 'Use at least 8 characters').max(100),
    city: z.string().trim().min(2).max(60), group: z.enum(GROUPS as [string, ...string[]]), sex: z.enum(['F', 'M']),
    age: z.number().int().min(18).max(65), weight: z.number().min(30).max(250),
  }), req.body);
  if (await User.exists({ phone: b.phone })) throw conflict('An account with this number already exists');
  const id = uid('u').toLowerCase();
  const initials = b.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const u = await User.create({ _id: id, role: 'user', name: b.name, org: 'Donor & patient family', initials, phone: b.phone, passwordHash: await bcrypt.hash(b.password, 10) });
  await Profile.create({ _id: id, name: b.name, phone: `+91 ${b.phone.slice(0, 2)}••• ••${b.phone.slice(-3)}`, city: b.city, group: b.group, age: b.age, weight: b.weight, sex: b.sex, donorActive: true, rareDonor: false, shareContact: false, family: [] });
  await ensureWallet(id);
  res.status(201).json({ token: signToken({ _id: id, role: 'user' }), user: publicUser(u.toObject()) });
});

/** One-click sign-in as a sample account, so the portal picker on /login keeps working. Off in production. */
auth.post('/demo', async (req, res) => {
  if (!config.demoLogin) throw forbidden('Demo sign-in is turned off');
  const { role } = parse(z.object({ role: z.enum(['user', 'bank', 'referral', 'franchise', 'admin']) }), req.body);
  const u = await User.findById(ME[role]).lean<Record<string, any>>();
  if (!u) throw unauthorized('Demo accounts are missing. Run `npm run seed` in server/.');
  res.json({ token: signToken(u as { _id: string; role: Role }), user: publicUser(u) });
});

auth.get('/me', requireAuth, (req, res) => { res.json({ user: me(req) }); });
