import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '../../../src/data/types.ts';
import { config } from '../config.ts';
import { Bank, User } from '../models/index.ts';
import { forbidden, unauthorized } from './http.ts';

export interface Me {
  id: string; role: Role; name: string; org: string; initials: string; phone: string;
  /** Bank staff only: their centre plus its branch centres. */
  centres: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { me?: Me } }
}

export const signToken = (u: { _id: string; role: Role }) =>
  jwt.sign({ sub: u._id, role: u.role }, config.jwtSecret, { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] });

export async function loadMe(token: string): Promise<Me> {
  let payload: jwt.JwtPayload;
  try { payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload; } catch { throw unauthorized('Session expired, sign in again'); }
  const u = await User.findById(payload.sub).lean<Record<string, any>>();
  if (!u) throw unauthorized('Account not found');
  let centres: string[] = [];
  if (u.role === 'bank') {
    const home = u.bankId ?? u._id;
    const kids = await Bank.find({ parentId: home }, { _id: 1 }).lean<{ _id: string }[]>();
    centres = [home, ...kids.map((k) => k._id)];
  }
  return { id: u._id, role: u.role, name: u.name, org: u.org, initials: u.initials, phone: u.phone, centres };
}

/** Reads `Authorization: Bearer <token>` (or `?token=` for EventSource, which cannot send headers). */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  const token = h?.startsWith('Bearer ') ? h.slice(7) : typeof req.query.token === 'string' ? req.query.token : undefined;
  if (!token) throw unauthorized();
  req.me = await loadMe(token);
  next();
}

export const requireRole = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.me) throw unauthorized();
  if (!roles.includes(req.me.role)) throw forbidden(`Only ${roles.join(' or ')} accounts can do this`);
  next();
};

export const me = (req: Request): Me => {
  if (!req.me) throw unauthorized();
  return req.me;
};

/** Bank staff may act only on their own centres; admins on any. */
export function assertCentre(m: Me, bankId: string) {
  if (m.role === 'admin') return;
  if (m.role === 'bank' && m.centres.includes(bankId)) return;
  throw forbidden('This belongs to another blood centre');
}

/** Name shown in the audit trail: organisations for referral partners, the person otherwise. */
export const actor = (m: Me) => (m.role === 'referral' ? m.org : m.name);
