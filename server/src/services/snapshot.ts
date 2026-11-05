import type { Me } from '../lib/auth.ts';
import {
  AccountEntry, Application, Audit, Bank, Batch, Camp, Donation, DonorRequest, Lead, Ledger, MonthStat, Notice, Order, Plan,
  Profile, Referral, Sensor, Thread, Ticket, Wallet, toApi,
} from '../models/index.ts';

type L = Record<string, any>;
const list = (rows: L[]) => rows.map((r) => toApi(r));

/**
 * Everything one portal needs, in exactly the frontend's `DB` shape (src/data/types.ts), so the
 * store can swap localStorage for this response without touching the pages.
 * Private data (wallets, orders, chats, notices, profile) is limited to what this account may see.
 */
export async function snapshot(m: Me) {
  const isOps = m.role === 'admin' || m.role === 'franchise';
  const orderFilter = isOps ? {} : m.role === 'bank' ? { bankId: { $in: m.centres } } : { ownerId: m.id };
  const walletIds = m.role === 'admin' ? undefined : [m.id];
  const walletFilter = walletIds ? { _id: { $in: walletIds } } : {};
  const ledgerFilter = walletIds ? { ownerId: { $in: walletIds } } : {};
  const noticeFilter = { to: { $in: [m.role, 'all'] }, $or: [{ ownerId: { $exists: false } }, { ownerId: null }, { ownerId: { $in: [m.id, ...m.centres] } }] };
  const donationFilter = m.role === 'bank' ? { bankId: { $in: m.centres } } : m.role === 'user' ? { donorId: m.id } : {};
  const accountFilter = m.role === 'bank' ? { bankId: { $in: m.centres } } : m.role === 'admin' ? {} : { _id: null };

  const [banks, batches, orders, wallets, ledger, donations, camps, requests, threads, notices, referrals, accounts, applications, leads, tickets, audit, profile, plans, months, sensors] = await Promise.all([
    Bank.find().lean<L[]>(),
    Batch.find().sort({ expiry: 1 }).lean<L[]>(),
    Order.find(orderFilter).sort({ createdAt: -1 }).lean<L[]>(),
    Wallet.find(walletFilter).lean<L[]>(),
    Ledger.find(ledgerFilter).sort({ at: -1 }).limit(2000).lean<L[]>(),
    Donation.find(donationFilter).sort({ date: -1 }).lean<L[]>(),
    Camp.find().sort({ date: -1 }).lean<L[]>(),
    DonorRequest.find().sort({ createdAt: -1 }).lean<L[]>(),
    Thread.find({ members: m.id }).sort({ updatedAt: -1 }).lean<L[]>(),
    Notice.find(noticeFilter).sort({ at: -1 }).limit(200).lean<L[]>(),
    Referral.find(m.role === 'bank' ? { bankId: { $in: m.centres } } : {}).lean<L[]>(),
    AccountEntry.find(accountFilter).sort({ at: -1 }).lean<L[]>(),
    Application.find(m.role === 'franchise' ? { franchiseId: m.id } : {}).sort({ at: -1 }).lean<L[]>(),
    Lead.find(isOps ? {} : { _id: null }).lean<L[]>(),
    Ticket.find(isOps ? {} : { from: m.org }).sort({ at: -1 }).lean<L[]>(),
    Audit.find(m.role === 'admin' || m.role === 'bank' ? {} : { _id: null }).sort({ at: -1 }).limit(300).lean<L[]>(),
    Profile.findById(m.id).lean<L>(),
    Plan.find(isOps ? {} : { ownerId: m.id }).lean<L[]>(),
    MonthStat.find().sort({ order: 1 }).lean<L[]>(),
    Sensor.find(m.role === 'bank' ? { bankId: { $in: m.centres } } : {}).lean<L[]>(),
  ]);

  const byOwner: Record<string, L> = {};
  for (const w of wallets) byOwner[w._id] = { ownerId: w._id, balance: w.balance, held: w.held, credits: w.credits, creditsHeld: w.creditsHeld, ledger: [] };
  for (const l of ledger) {
    const { ownerId, ...rest } = toApi(l);
    byOwner[ownerId as string]?.ledger.push(rest);
  }
  byOwner[m.id] ??= { ownerId: m.id, balance: 0, held: 0, credits: 0, creditsHeld: 0, ledger: [] };

  return {
    banks: list(banks), batches: list(batches), orders: list(orders), wallets: byOwner, donations: list(donations), camps: list(camps),
    requests: list(requests), threads: list(threads), notices: list(notices).map(({ ownerId: _o, ...n }) => n), referrals: list(referrals),
    accounts: list(accounts), applications: list(applications), leads: list(leads), tickets: list(tickets), audit: list(audit),
    // Non-patient portals have no donor profile; send a harmless stub so shared screens still render.
    profile: profile ? toApi(profile) : { id: m.id, name: m.name, phone: m.phone, city: '', group: 'O+', age: 0, weight: 0, sex: 'M', donorActive: false, rareDonor: false, shareContact: false, family: [] },
    plans: list(plans), months: months.map(({ m: mo, collected, issued }) => ({ m: mo, collected, issued })), sensors: list(sensors),
    me: { id: m.id, role: m.role, name: m.name, org: m.org, initials: m.initials },
  };
}
