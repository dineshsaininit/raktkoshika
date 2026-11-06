import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { GROUPS, uid } from '../../../src/data/rules.ts';
import { DEMO_ACCOUNTS } from '../../../src/data/demoAccounts.ts';
import type { Role } from '../../../src/data/types.ts';
import { config } from '../config.ts';
import { one, q, tx } from '../db.ts';
import { me, requireAuth, signToken } from '../lib/auth.ts';
import { conflict, forbidden, parse, unauthorized } from '../lib/http.ts';
import { ensureWallet } from '../lib/records.ts';

export const auth = Router();
// Slows down password guessing: 30 attempts per 15 minutes per address.
auth.use(rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many attempts. Wait a few minutes and try again.' } }));

const phone = z.string().trim().transform((s) => s.replace(/\D/g, '').slice(-10)).pipe(z.string().length(10, 'Enter a 10-digit mobile number'));
const publicUser = (u: Record<string, any>) => ({ id: u.id, role: u.role as Role, name: u.name, org: u.org, initials: u.initials, phone: u.phone });

/** Mobile number + password. Swap for mobile + OTP (MSG91, Twilio Verify, Firebase Auth) when an SMS provider is chosen. */
auth.post('/login', async (req, res) => {
  const b = parse(z.object({ phone, password: z.string().min(1).max(200) }), req.body);
  const u = await one('select * from users where phone = $1', [b.phone]);
  if (!u?.password_hash || !(await bcrypt.compare(b.password, u.password_hash))) throw unauthorized('Wrong mobile number or password');
  res.json({ token: signToken(u as { id: string; role: Role }), user: publicUser(u) });
});

/** Patient / donor self sign-up. Centres, hospitals and franchises are onboarded by Raktkoshika, not self-registered. */
auth.post('/register', async (req, res) => {
  const b = parse(z.object({
    name: z.string().trim().min(2, 'Enter your full name').max(80), phone, password: z.string().min(8, 'Use at least 8 characters').max(100),
    city: z.string().trim().min(2, 'Enter your city').max(60), group: z.enum(GROUPS as [string, ...string[]]), sex: z.enum(['F', 'M']),
    age: z.number().int().min(18, 'You must be 18 or older').max(65), weight: z.number().min(30).max(250),
  }), req.body);
  if (await one('select 1 from users where phone = $1', [b.phone])) throw conflict('An account with this number already exists. Sign in instead.');
  const id = uid('u').toLowerCase();
  const initials = b.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const hash = await bcrypt.hash(b.password, 10);
  await tx(async (c) => {
    await q(`insert into users (id, role, name, org, initials, phone, password_hash) values ($1,'user',$2,'Donor & patient family',$3,$4,$5)`, [id, b.name, initials, b.phone, hash], c);
    await q('insert into profiles (id, name, phone, city, grp, age, weight, sex) values ($1,$2,$3,$4,$5,$6,$7,$8)',
      [id, b.name, `+91 ${b.phone.slice(0, 2)}••• ••${b.phone.slice(-3)}`, b.city, b.group, b.age, b.weight, b.sex], c);
    await ensureWallet(id, c);
    await q(`update threads set members = array_append(members, $1) where id = 'T-3' and not ($1 = any(members))`, [id], c);
  });
  const u = await one('select * from users where id = $1', [id]);
  res.status(201).json({ token: signToken({ id, role: 'user' }), user: publicUser(u!) });
});

/** One-click sign-in as a sample account, without a password. Off unless DEMO_LOGIN=true. */
auth.post('/demo', async (req, res) => {
  if (!config.demoLogin) throw forbidden('Demo sign-in is turned off. Sign in with a mobile number and password.');
  const { role } = parse(z.object({ role: z.enum(['user', 'bank', 'referral', 'franchise', 'admin']) }), req.body);
  const acct = DEMO_ACCOUNTS.find((a) => a.role === role)!;
  const u = await one('select * from users where id = $1', [acct.id]);
  if (!u) throw unauthorized('Sample accounts are missing. Run `npm run seed` in server/.');
  res.json({ token: signToken(u as { id: string; role: Role }), user: publicUser(u) });
});

auth.get('/me', requireAuth, (req, res) => { res.json({ user: me(req) }); });
