import { q } from '../db.ts';
import type { Me } from '../lib/auth.ts';
import {
  accountOut, applicationOut, auditOut, bankOut, batchOut, campOut, donationOut, leadOut, ledgerOut, noticeOut, orderOut, planOut,
  profileOut, referralOut, requestOut, sensorOut, threadOut, ticketOut,
} from '../lib/rows.ts';

type R = Record<string, any>;
const groupBy = (rows: R[], key: string) => {
  const m = new Map<string, R[]>();
  for (const r of rows) { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
  return m;
};

/**
 * Everything one portal needs, in exactly the frontend's `DB` shape (src/data/types.ts), so the store can
 * swap localStorage for this response without touching the pages. Each account sees only what its job needs:
 * patients and hospitals their own orders, wallets and chats; centres their own centres; HQ everything.
 */
export async function snapshot(m: Me) {
  const admin = m.role === 'admin';
  const bank = m.role === 'bank';
  const ops = admin || m.role === 'franchise';
  const mine = [m.id, ...m.centres];

  const [banks, batches, orders, events, wallets, ledger, donations, camps, requests, threads, messages, notices, referrals, accounts,
    applications, leads, tickets, audit, profile, family, plans, months, sensors] = await Promise.all([
    q('select * from banks order by created_at, id'),
    q('select * from batches order by expiry'),
    admin ? q('select * from orders order by created_at desc')
      : bank ? q('select * from orders where bank_id = any($1) order by created_at desc', [m.centres])
        : q('select * from orders where owner_id = $1 order by created_at desc', [m.id]),
    admin ? q('select order_id, stage, at, note from order_events order by id')
      : bank ? q('select e.order_id, e.stage, e.at, e.note from order_events e join orders o on o.id = e.order_id where o.bank_id = any($1) order by e.id', [m.centres])
        : q('select e.order_id, e.stage, e.at, e.note from order_events e join orders o on o.id = e.order_id where o.owner_id = $1 order by e.id', [m.id]),
    admin ? q('select * from wallets') : q('select * from wallets where owner_id = $1', [m.id]),
    admin ? q('select * from ledger order by at desc limit 3000') : q('select * from ledger where owner_id = $1 order by at desc limit 1000', [m.id]),
    admin ? q('select * from donations order by date desc')
      : bank ? q('select * from donations where bank_id = any($1) order by date desc', [m.centres])
        : q('select * from donations where donor_id = $1 order by date desc', [m.id]),
    q('select * from camps order by date desc'),
    q('select * from donor_requests order by created_at desc'),
    q('select * from threads where $1 = any(members) order by updated_at desc', [m.id]),
    q('select m.* from messages m join threads t on t.id = m.thread_id where $1 = any(t.members) order by m.at', [m.id]),
    q('select * from notices where to_role in ($1, $2) and (owner_id is null or owner_id = any($3)) order by at desc limit 200', [m.role, 'all', mine]),
    admin ? q('select * from referrals') : bank ? q('select * from referrals where bank_id = any($1)', [m.centres]) : Promise.resolve([]),
    admin ? q('select * from account_entries order by at desc') : bank ? q('select * from account_entries where bank_id = any($1) order by at desc', [m.centres]) : Promise.resolve([]),
    admin ? q('select * from applications order by at desc') : m.role === 'franchise' ? q('select * from applications where franchise_id = $1 order by at desc', [m.id]) : Promise.resolve([]),
    ops ? q('select * from leads order by name') : Promise.resolve([]),
    ops ? q('select * from tickets order by at desc') : q('select * from tickets where from_org = $1 order by at desc', [m.org]),
    admin ? q('select * from audit order by at desc limit 300') : Promise.resolve([]),
    q('select * from profiles where id = $1', [m.id]),
    q('select * from family_members where profile_id = $1 order by name', [m.id]),
    admin ? q('select * from plans') : q('select * from plans where owner_id = $1', [m.id]),
    q('select * from month_stats order by idx'),
    admin ? q('select * from sensors') : bank ? q('select * from sensors where bank_id = any($1)', [m.centres]) : Promise.resolve([]),
  ]);

  const evByOrder = groupBy(events, 'order_id');
  const msgByThread = groupBy(messages, 'thread_id');
  const ledgerByOwner = groupBy(ledger, 'owner_id');
  const walletMap: Record<string, unknown> = {};
  for (const w of wallets) {
    walletMap[w.owner_id] = { ownerId: w.owner_id, balance: w.balance, held: w.held, credits: w.credits, creditsHeld: w.credits_held, ledger: (ledgerByOwner.get(w.owner_id) ?? []).map(ledgerOut) };
  }
  walletMap[m.id] ??= { ownerId: m.id, balance: 0, held: 0, credits: 0, creditsHeld: 0, ledger: [] };

  return {
    banks: banks.map(bankOut),
    batches: batches.map(batchOut),
    orders: orders.map((o) => orderOut(o, evByOrder.get(o.id))),
    wallets: walletMap,
    donations: donations.map(donationOut),
    camps: camps.map(campOut),
    requests: requests.map(requestOut),
    threads: threads.map((t) => threadOut(t, msgByThread.get(t.id))),
    notices: notices.map(noticeOut),
    referrals: referrals.map(referralOut),
    accounts: accounts.map(accountOut),
    applications: applications.map(applicationOut),
    leads: leads.map(leadOut),
    tickets: tickets.map(ticketOut),
    audit: audit.map(auditOut),
    // Accounts without a donor profile get a harmless stub so shared screens still render.
    profile: profile[0] ? profileOut(profile[0], family)
      : { id: m.id, name: m.name, phone: m.phone, city: '', group: 'O+', age: 0, weight: 0, sex: 'M', donorActive: false, rareDonor: false, shareContact: false, family: [] },
    plans: plans.map(planOut),
    months: months.map((r) => ({ m: r.m, collected: r.collected, issued: r.issued })),
    sensors: sensors.map(sensorOut),
    me: { id: m.id, role: m.role, name: m.name, org: m.org, initials: m.initials },
  };
}

/** What anyone may see without signing in: verified centres and in-date available units, for "Find blood". */
export async function publicSnapshot() {
  const [banks, batches] = await Promise.all([
    q('select * from banks where verified order by created_at, id'),
    q(`select b.* from batches b join banks k on k.id = b.bank_id where k.verified and b.status = 'available' and b.expiry > now() order by b.expiry`),
  ]);
  return { banks: banks.map((b) => ({ ...bankOut(b), license: '' })), batches: batches.map(batchOut) };
}
