import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BloodGroup, Camp, Component, DB, DonorRequest, LeadStage, Notice, Order, Role, Stage, Wallet } from '../data/types';
import { COMPONENTS, MIN_HB, processingFee, uid } from '../data/rules';
import { makeSeed } from '../data/seed';
import { apiMode, call, fetchDb, fetchPublic, logout, SignedOut, subscribe, selectSession } from '../api/client';

const KEY = 'raktkoshika-demo-v1';
const load = (): DB => {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch { /* fall through to seed */ }
  return makeSeed();
};
const now = () => new Date().toISOString();

export interface NewOrder {
  ownerId: string; actor: string; kind: 'order' | 'booking'; urgency: 'sos' | 'routine'; patient: Order['patient'];
  group: BloodGroup; component: Component; units: number; bankId: string; scheduledFor?: string; fulfilment: 'collect' | 'delivery';
  rx: string; rxFileId?: string; method: 'wallet' | 'counter'; creditsToUse: number; seriesId?: string;
}

function ledger(w: Wallet, kind: Wallet['ledger'][number]['kind'], amount: number, credits: number, note: string, ref?: string) {
  w.ledger.unshift({ id: uid('L'), at: now(), kind, amount, credits, note, ref });
}
function notify(db: DB, to: Notice['to'], title: string, body: string, tone: Notice['tone'] = 'info', link?: string) {
  db.notices.unshift({ id: uid('N'), to, title, body, at: now(), read: false, tone, link });
}
function audit(db: DB, actor: string, action: string, target: string) {
  db.audit.unshift({ id: uid('AU'), at: now(), actor, action, target });
}
const ensureWallet = (db: DB, id: string) => (db.wallets[id] ??= { ownerId: id, balance: 0, held: 0, credits: 0, creditsHeld: 0, ledger: [] });
const ownerRole = (id: string): Role => (id === 'u1' ? 'user' : 'referral');

/** Money moves through three states: available → held → settled to the centre, or released back. */
function releaseHold(db: DB, o: Order, why: string) {
  if (o.payment.settled) return;
  const w = ensureWallet(db, o.ownerId);
  if (o.payment.method === 'wallet' && o.payment.cash) {
    w.held -= o.payment.cash; w.balance += o.payment.cash;
    ledger(w, 'release', o.payment.cash, 0, `Released, ${why} (${o.id})`, o.id);
  }
  if (o.payment.creditsUsed) {
    w.creditsHeld -= o.payment.creditsUsed; w.credits += o.payment.creditsUsed;
    ledger(w, 'credit_release', 0, o.payment.creditsUsed, `Credit returned, ${why} (${o.id})`, o.id);
  }
}

function useActions(setDb: (fn: (d: DB) => void) => void) {
  return useMemo(() => ({
    reset: () => setDb((d) => { Object.assign(d, makeSeed()); }),

    placeOrder(input: NewOrder): string {
      const id = `RK-${Math.floor(20500 + Math.random() * 9000)}`;
      setDb((d) => {
        const bank = d.banks.find((b) => b.id === input.bankId)!;
        const fee = processingFee(input.component, bank);
        const creditsUsed = Math.min(input.creditsToUse, input.units);
        const cash = (input.units - creditsUsed) * fee;
        const w = ensureWallet(d, input.ownerId);
        if (input.method === 'wallet' && cash) {
          w.balance -= cash; w.held += cash;
          ledger(w, 'hold', -cash, 0, `Held for order ${id}`, id);
        }
        if (creditsUsed) {
          w.credits -= creditsUsed; w.creditsHeld += creditsUsed;
          ledger(w, 'credit_hold', 0, -creditsUsed, `Credit reserved for order ${id}`, id);
        }
        d.orders.unshift({
          id, ownerId: input.ownerId, kind: input.kind, urgency: input.urgency, patient: input.patient, group: input.group, component: input.component,
          units: input.units, bankId: input.bankId, scheduledFor: input.scheduledFor, seriesId: input.seriesId, fulfilment: input.fulfilment, rx: input.rx, rxFileId: input.rxFileId, stage: 'placed',
          events: [{ stage: 'placed', at: now() }], payment: { method: input.method, fee, total: fee * input.units, creditsUsed, cash, settled: false },
        });
        notify(d, 'bank', `${input.urgency === 'sos' ? 'SOS: ' : ''}${input.units} unit${input.units > 1 ? 's' : ''} ${input.group} ${COMPONENTS[input.component].short}`, `${input.patient.hospital} · ${id}`, input.urgency === 'sos' ? 'crit' : 'info', 'requests');
        audit(d, input.actor, input.urgency === 'sos' ? 'Placed SOS order' : input.kind === 'booking' ? 'Booked units' : 'Placed order', id);
      });
      return id;
    },

    advanceOrder(id: string, actor: string) {
      setDb((d) => {
        const o = d.orders.find((x) => x.id === id);
        if (!o) return;
        const flow: Stage[] = ['placed', 'rx_verified', 'sample_received', 'crossmatched', 'issued', 'completed'];
        const next = flow[flow.indexOf(o.stage) + 1];
        if (!next) return;
        if (next === 'crossmatched') {
          // First-expiry-first-out: allocate the units closest to expiry.
          d.batches
            .filter((u) => u.bankId === o.bankId && u.group === o.group && u.component === o.component && u.status === 'available')
            .sort((a, b) => a.expiry.localeCompare(b.expiry)).slice(0, o.units)
            .forEach((u) => { u.status = 'reserved'; u.orderId = o.id; });
        }
        if (next === 'issued') {
          d.batches.filter((u) => u.orderId === o.id && u.status === 'reserved').forEach((u) => { u.status = 'issued'; });
          const w = ensureWallet(d, o.ownerId);
          const bankWallet = ensureWallet(d, o.bankId);
          if (o.payment.method === 'wallet' && o.payment.cash) {
            w.held -= o.payment.cash;
            ledger(w, 'capture', -o.payment.cash, 0, `Processing charge, order ${o.id}`, o.id);
            bankWallet.balance += o.payment.cash;
            ledger(bankWallet, 'settlement', o.payment.cash, 0, `Received, order ${o.id}`, o.id);
          }
          if (o.payment.creditsUsed) {
            w.creditsHeld -= o.payment.creditsUsed;
            ledger(w, 'credit_use', 0, 0, `${o.payment.creditsUsed} credit used, order ${o.id}`, o.id);
          }
          o.payment.settled = true;
          d.accounts.unshift({ id: uid('A'), bankId: o.bankId, at: now(), kind: 'income', head: `Processing charges, ${COMPONENTS[o.component].short.toLowerCase()} (${o.id})`, amount: o.payment.total, ref: o.id });
        }
        o.stage = next;
        o.events.push({ stage: next, at: now() });
        const labels: Record<string, string> = { rx_verified: 'Prescription verified', sample_received: 'Sample received', crossmatched: 'Cross-match compatible', issued: 'Units issued', completed: 'Handed over' };
        notify(d, ownerRole(o.ownerId), `${labels[next]} · ${o.id}`, `${o.units} unit${o.units > 1 ? 's' : ''} ${o.group} for ${o.patient.name}`, next === 'completed' || next === 'issued' ? 'good' : 'info', `orders/${o.id}`);
        audit(d, actor, labels[next], o.id);
      });
    },

    closeOrder(id: string, actor: string, stage: 'rejected' | 'cancelled', why: string) {
      setDb((d) => {
        const o = d.orders.find((x) => x.id === id);
        if (!o) return;
        releaseHold(d, o, stage === 'rejected' ? 'request declined' : 'order cancelled');
        d.batches.filter((u) => u.orderId === id && u.status === 'reserved').forEach((u) => { u.status = 'available'; u.orderId = undefined; });
        o.stage = stage;
        o.events.push({ stage, at: now(), note: why });
        if (stage === 'rejected') notify(d, ownerRole(o.ownerId), `Request declined · ${id}`, `${why}. Any held amount is back in your wallet.`, 'warn', `orders/${id}`);
        else notify(d, 'bank', `Order cancelled · ${id}`, why, 'warn', 'requests');
        audit(d, actor, stage === 'rejected' ? 'Declined order' : 'Cancelled order', id);
      });
    },

    reportReaction(id: string, text: string, actor: string) {
      setDb((d) => {
        const o = d.orders.find((x) => x.id === id);
        if (o) o.reaction = text;
        notify(d, 'bank', `Transfusion reaction reported · ${id}`, text, 'crit', 'quality');
        notify(d, 'admin', `Haemovigilance report · ${id}`, text, 'crit', 'compliance');
        audit(d, actor, 'Reported transfusion reaction', id);
      });
    },

    topUp(owner: string, amount: number, method: string) {
      setDb((d) => { const w = ensureWallet(d, owner); w.balance += amount; ledger(w, 'topup', amount, 0, `Added via ${method}`); });
    },
    settle(owner: string, amount: number) {
      setDb((d) => { const w = ensureWallet(d, owner); w.balance -= amount; ledger(w, 'settlement', -amount, 0, 'Paid out to bank account ending 4417'); });
    },
    giftCredit(owner: string, member: string) {
      setDb((d) => {
        const w = ensureWallet(d, owner);
        if (w.credits < 1) return;
        w.credits -= 1;
        ledger(w, 'credit_gift', 0, -1, `Reserved for family member: ${member}`);
        audit(d, d.profile.name, 'Assigned donor credit to family', member);
      });
    },
    addFamily(name: string, relation: string, group: BloodGroup) {
      setDb((d) => { d.profile.family.push({ id: uid('F'), name, relation, group }); });
    },
    updateProfile(patch: Partial<DB['profile']>) { setDb((d) => { Object.assign(d.profile, patch); }); },

    bookDonation(bankId: string, date: string, slot: string, campId?: string) {
      const id = uid('D');
      setDb((d) => {
        d.donations.unshift({ id, donorId: 'u1', donorName: d.profile.name, group: d.profile.group, bankId, date, slot, status: 'booked', campId });
        const camp = d.camps.find((c) => c.id === campId);
        if (camp) camp.registered += 1;
        notify(d, 'bank', 'New donor slot booked', `${d.profile.name} · ${d.profile.group} · ${slot}`, 'info', 'donors');
        audit(d, d.profile.name, 'Booked donation slot', id);
      });
      return id;
    },
    cancelDonation(id: string) { setDb((d) => { const x = d.donations.find((v) => v.id === id); if (x) x.status = 'cancelled'; }); },

    recordDonation(id: string, hb: number, actor: string) {
      setDb((d) => {
        const x = d.donations.find((v) => v.id === id);
        if (!x) return;
        x.hb = hb;
        if (hb < MIN_HB) {
          x.status = 'deferred'; x.note = `Haemoglobin below ${MIN_HB} g/dL`;
          if (x.donorId === 'u1') notify(d, 'user', 'Donation deferred today', 'Your haemoglobin was below the safe limit. Try again after a few weeks of iron-rich meals.', 'warn', 'donate');
          audit(d, actor, 'Deferred donor', id);
          return;
        }
        x.status = 'completed'; x.date = now();
        if (x.donorId === 'u1') d.profile.lastDonation = now();
        // New units wait in quarantine until screening clears them.
        (['PRBC', 'FFP'] as Component[]).forEach((c) => {
          const exp = new Date(); exp.setDate(exp.getDate() + COMPONENTS[c].shelfDays);
          d.batches.unshift({ id: uid('Q'), bankId: x.bankId, group: x.group, component: c, collected: now(), expiry: exp.toISOString(), status: 'quarantine', source: x.campId ? 'Camp' : 'Voluntary' });
        });
        const w = ensureWallet(d, x.donorId);
        w.credits += 1;
        ledger(w, 'credit_earn', 0, 1, `Verified donation at ${d.banks.find((b) => b.id === x.bankId)?.name}`, id);
        if (x.donorId === 'u1') notify(d, 'user', 'Thank you. 1 donor credit added', 'Valid at every centre in the network for 12 months.', 'good', 'wallet');
        audit(d, actor, 'Recorded donation, units in quarantine', id);
      });
    },

    releaseQuarantine(ids: string[], actor: string) {
      setDb((d) => {
        d.batches.filter((u) => ids.includes(u.id)).forEach((u) => { u.status = 'available'; });
        audit(d, actor, `Released ${ids.length} unit(s) after screening`, ids[0]);
      });
    },
    discard(id: string, reason: string, actor: string) {
      setDb((d) => {
        const u = d.batches.find((x) => x.id === id);
        if (u) { u.status = 'discarded'; u.discardReason = reason; }
        audit(d, actor, `Discarded unit: ${reason}`, id);
      });
    },
    transfer(id: string, toBank: string, actor: string) {
      setDb((d) => {
        const u = d.batches.find((x) => x.id === id);
        if (!u) return;
        u.bankId = toBank; u.source = 'Transfer';
        audit(d, actor, `Transferred unit to ${d.banks.find((x) => x.id === toBank)?.name}`, id);
      });
    },

    requestCamp(c: Omit<Camp, 'id' | 'status' | 'registered' | 'collected'>) {
      setDb((d) => {
        d.camps.unshift({ ...c, id: uid('C'), status: 'requested', registered: 0, collected: 0 });
        notify(d, 'bank', 'New camp request', `${c.org} · ${c.city}`, 'info', 'camps');
        audit(d, c.org, 'Requested blood camp', c.city);
      });
    },
    campRespond(id: string, status: Camp['status'], bankId: string, actor: string) {
      setDb((d) => {
        const c = d.camps.find((x) => x.id === id);
        if (!c) return;
        c.status = status;
        if (status === 'accepted') c.acceptedBy = bankId;
        if (status === 'completed') c.collected = Math.round(c.registered * 0.82);
        audit(d, actor, `Camp ${status}`, id);
      });
    },

    postRequest(r: Omit<DonorRequest, 'id' | 'responders' | 'status'>) {
      setDb((d) => {
        d.requests.unshift({ ...r, id: uid('DR'), responders: [], status: 'open' });
        audit(d, r.byName, 'Posted donor request', `${r.units} × ${r.group}`);
      });
    },
    respond(id: string, name: string) {
      setDb((d) => { const r = d.requests.find((x) => x.id === id); if (r && !r.responders.includes(name)) r.responders.push(name); });
    },
    closeRequest(id: string) { setDb((d) => { const r = d.requests.find((x) => x.id === id); if (r) r.status = 'fulfilled'; }); },

    send(threadId: string, from: string, text: string) {
      setDb((d) => { d.threads.find((t) => t.id === threadId)?.messages.push({ id: uid('m'), from, text, at: now() }); });
    },
    broadcast(group: BloodGroup, city: string, note: string, from: string) {
      setDb((d) => {
        const by = from === 'a1' ? 'Raktkoshika' : 'Krishna Valley Blood Centre';
        d.threads.unshift({ id: uid('T'), title: `${group.replace('-', '−')} donors · ${city}`, subtitle: 'Broadcast to opted-in donors', kind: 'broadcast', members: ['u1', 'r1', 'b1', 'a1'], messages: [{ id: uid('m'), from, text: note, at: now() }] });
        d.requests.unshift({ id: uid('DR'), byId: from, byName: by, group, units: 5, hospital: 'Network shortage alert', city, neededBy: new Date(Date.now() + 2 * 864e5).toISOString(), note, feeSupport: false, responders: [], status: 'open', broadcast: true });
        notify(d, 'user', `${group} donors needed in ${city}`, note, 'warn', 'donor-requests');
        notify(d, 'referral', `${group} shortage in ${city}`, note, 'warn', 'donor-requests');
        audit(d, by, 'Sent shortage broadcast', `${group} · ${city}`);
      });
    },
    readNotices(role: Role) { setDb((d) => { d.notices.forEach((n) => { if (n.to === role) n.read = true; }); }); },

    addCenter(name: string, city: string, license: string) {
      setDb((d) => {
        const parent = d.banks.find((b) => b.id === 'b1')!;
        d.banks.push({ ...parent, id: uid('B'), name, city, district: city, license, km: 20, syncMin: 0, parentId: 'b1', open24: false, rating: 5 });
        audit(d, 'Dr. Meera Patil', 'Created centre', name);
      });
    },
    addReferral(name: string, kind: DB['referrals'][number]['kind'], city: string, contact: string) {
      setDb((d) => {
        d.referrals.push({ id: uid('R'), bankId: 'b1', name, kind, city, contact, plan: 'Monthly', units: 0, status: 'invited' });
        audit(d, 'Dr. Meera Patil', 'Invited referral', name);
      });
    },
    addExpense(head: string, amount: number) {
      setDb((d) => { d.accounts.unshift({ id: uid('A'), bankId: 'b1', at: now(), kind: 'expense', head, amount }); });
    },
    addPlan(p: Omit<DB['plans'][number], 'id' | 'active'>) { setDb((d) => { d.plans.unshift({ ...p, id: uid('T'), active: true }); }); },
    togglePlan(id: string) { setDb((d) => { const p = d.plans.find((x) => x.id === id); if (p) p.active = !p.active; }); },

    decideApplication(id: string, status: 'approved' | 'rejected') {
      setDb((d) => {
        const a = d.applications.find((x) => x.id === id);
        if (!a) return;
        a.status = status;
        if (status === 'approved') {
          d.banks.push({ id: uid('B'), name: a.name, city: a.city, district: a.district, type: a.type, license: a.license, km: 60, rating: 5, open24: false, verified: true, syncMin: 1, phone: '+91 90000 19999' });
          const l = d.leads.find((x) => x.name === a.name);
          if (l) l.stage = 'Live';
          notify(d, 'franchise', `${a.name} is live`, 'Licence verified by Raktkoshika.', 'good', 'pipeline');
        } else notify(d, 'franchise', `${a.name} needs corrections`, 'Upload the missing document and resubmit.', 'warn', 'centres');
        audit(d, 'Network Ops', status === 'approved' ? 'Approved centre' : 'Sent back application', a.name);
      });
    },
    submitApplication(name: string, city: string, license: string) {
      setDb((d) => {
        d.applications.unshift({ id: uid('AP'), name, city, district: city, license, type: 'Charitable', franchiseId: 'f1', status: 'pending', at: now(), docs: [{ name: 'FDA blood centre licence', ok: true }, { name: 'SBTC registration', ok: true }, { name: 'Medical officer registration', ok: true }, { name: 'e-RaktKosh ID', ok: true }] });
        notify(d, 'admin', 'New centre application', `${name} · ${city}`, 'warn', 'verification');
        audit(d, 'Vikram Jadhav', 'Submitted centre application', name);
      });
    },
    moveLead(id: string, stage: LeadStage) { setDb((d) => { const l = d.leads.find((x) => x.id === id); if (l) l.stage = stage; }); },
    addLead(name: string, city: string, contact: string, plan: string) { setDb((d) => { d.leads.unshift({ id: uid('LD'), name, city, contact, plan, stage: 'Lead' }); }); },
    resolveTicket(id: string) { setDb((d) => { const t = d.tickets.find((x) => x.id === id); if (t) t.status = 'resolved'; }); },
    addTicket(from: string, subject: string) { setDb((d) => { d.tickets.unshift({ id: uid('TK'), from, subject, priority: 'Normal', status: 'open', at: now() }); }); },
  }), [setDb]);
}

type Actions = ReturnType<typeof useActions>;
type Remote = { [K in keyof Actions]?: (result: ReturnType<Actions[K]>, ...args: Parameters<Actions[K]>) => Promise<unknown> };

/** Profile fields are edited per keystroke; batch them into one PATCH. */
let profilePatch: Partial<DB['profile']> = {};
let profileTimer: ReturnType<typeof setTimeout> | undefined;
const patchProfile = (patch: Partial<DB['profile']>) => new Promise((resolve, reject) => {
  profilePatch = { ...profilePatch, ...patch };
  clearTimeout(profileTimer);
  profileTimer = setTimeout(() => { const body = profilePatch; profilePatch = {}; call('PATCH', '/profile', body).then(resolve, reject); }, 500);
});

/** The same actions, sent to the server. Each one receives the local result first (used for ids the UI already showed). */
const remote: Remote = {
  reset: () => call('POST', '/admin/reset'),
  placeOrder: (id, { ownerId: _o, actor: _a, ...input }) => call('POST', '/orders', { ...input, id }),
  advanceOrder: (_r, id) => call('POST', `/orders/${id}/advance`),
  closeOrder: (_r, id, _actor, stage, why) => call('POST', `/orders/${id}/${stage === 'rejected' ? 'reject' : 'cancel'}`, { reason: why }),
  reportReaction: (_r, id, text) => call('POST', `/orders/${id}/reaction`, { text }),
  topUp: (_r, _owner, amount, method) => call('POST', '/wallet/topup', { amount, method }),
  settle: (_r, _owner, amount) => call('POST', '/wallet/payout', { amount }),
  giftCredit: (_r, _owner, member) => call('POST', '/wallet/gift-credit', { member }),
  addFamily: (_r, name, relation, group) => call('POST', '/profile/family', { name, relation, group }),
  updateProfile: (_r, patch) => patchProfile(patch),
  bookDonation: (id, bankId, date, slot, campId) => call('POST', '/donations', { id, bankId, date, slot, campId }),
  cancelDonation: (_r, id) => call('POST', `/donations/${id}/cancel`),
  recordDonation: (_r, id, hb) => call('POST', `/donations/${id}/record`, { hb }),
  releaseQuarantine: (_r, ids) => call('POST', '/stock/release', { ids }),
  discard: (_r, id, reason) => call('POST', `/stock/${id}/discard`, { reason }),
  transfer: (_r, id, toBank) => call('POST', `/stock/${id}/transfer`, { toBank }),
  requestCamp: (_r, c) => call('POST', '/camps', { org: c.org, venue: c.venue, city: c.city, date: c.date, target: c.target, bankIds: c.bankIds }),
  campRespond: (_r, id, status, bankId) => call('POST', `/camps/${id}/respond`, { status, bankId }),
  postRequest: (_r, q) => call('POST', '/requests', { group: q.group, units: q.units, hospital: q.hospital, city: q.city, neededBy: q.neededBy, note: q.note, feeSupport: q.feeSupport }),
  respond: (_r, id) => call('POST', `/requests/${id}/respond`),
  closeRequest: (_r, id) => call('POST', `/requests/${id}/close`),
  send: (_r, threadId, _from, text) => call('POST', `/threads/${threadId}/messages`, { text }),
  broadcast: (_r, group, city, note) => call('POST', '/broadcasts', { group, city, note }),
  readNotices: () => call('POST', '/notices/read'),
  addCenter: (_r, name, city, license) => call('POST', '/bank/centres', { name, city, license }),
  addReferral: (_r, name, kind, city, contact) => call('POST', '/bank/referrals', { name, kind, city, contact }),
  addExpense: (_r, head, amount) => call('POST', '/bank/expenses', { head, amount }),
  addPlan: (_r, p) => call('POST', '/plans', { patient: p.patient, group: p.group, component: p.component, units: p.units, everyDays: p.everyDays, bankId: p.bankId, next: p.next }),
  togglePlan: (_r, id) => call('POST', `/plans/${id}/toggle`),
  decideApplication: (_r, id, status) => call('POST', `/applications/${id}/decision`, { status }),
  submitApplication: (_r, name, city, license) => call('POST', '/applications', { name, city, license }),
  moveLead: (_r, id, stage) => call('PATCH', `/leads/${id}`, { stage }),
  addLead: (_r, name, city, contact, plan) => call('POST', '/leads', { name, city, contact, plan }),
  resolveTicket: (_r, id) => call('POST', `/tickets/${id}/resolve`),
  addTicket: (_r, _from, subject) => call('POST', '/tickets', { subject }),
};

export type SyncState =
  | { mode: 'local' }
  | { mode: 'api'; status: 'connecting' | 'ready' | 'offline' | 'signedout'; error?: string; role?: Role };

interface StoreValue {
  db: DB; act: Actions; sync: SyncState;
  /** Signs a portal in to the server and loads its data. */
  connect: (role: Role) => void;
  /** Loads public stock for the website and "Find blood", without signing in. */
  loadPublic: () => void;
  /** Runs an action and waits for the server to accept it. Rejects with the server's message if it does not. */
  confirm: <K extends keyof Actions>(k: K, ...args: Parameters<Actions[K]>) => Promise<ReturnType<Actions[K]>>;
  signOut: (role: Role) => void;
  /** The last write the server refused, shown once to the person. */
  writeError: string | null;
  clearWriteError: () => void;
}
const Ctx = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setState] = useState<DB>(load);
  const [sync, setSync] = useState<SyncState>(apiMode ? { mode: 'api', status: 'connecting' } : { mode: 'local' });
  const [writeError, setWriteError] = useState<string | null>(null);
  const latest = useRef(db);
  const setDb = useCallback((fn: (d: DB) => void) => {
    const next = structuredClone(latest.current);
    fn(next);
    latest.current = next;
    setState(next);
    if (!apiMode) { try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* the demo keeps working in memory */ } }
  }, []);

  // ---- API mode: the server is the source of truth; local actions only paint the change instantly. ----
  const connected = useRef<Role | null>(null);
  const unsub = useRef<() => void>(() => {});
  const onFailure = useCallback((e: unknown) => {
    if (e instanceof SignedOut) {
      connected.current = null; unsub.current();
      setSync({ mode: 'api', status: 'signedout', role: e.role });
      return;
    }
    console.error('[api]', e);
    setSync((s) => ({ mode: 'api', status: 'offline', error: e instanceof Error ? e.message : String(e), role: s.mode === 'api' ? s.role : undefined }));
  }, []);
  const refresh = useCallback(async () => {
    const role = connected.current;
    const next = await fetchDb();
    if (connected.current !== role) return; // switched portal while this was loading
    latest.current = next; setState(next);
    setSync({ mode: 'api', status: 'ready', role: role ?? undefined });
  }, []);

  const connect = useCallback((role: Role) => {
    if (!apiMode || connected.current === role) return;
    unsub.current();
    try { selectSession(role); } catch (e) { onFailure(e); return; }
    connected.current = role;
    setSync({ mode: 'api', status: 'connecting', role });
    refresh().then(() => {
      let t: ReturnType<typeof setTimeout> | undefined;
      unsub.current = subscribe(() => { clearTimeout(t); t = setTimeout(() => { refresh().catch(onFailure); }, 150); });
    }).catch(onFailure);
  }, [refresh, onFailure]);
  useEffect(() => () => unsub.current(), []);

  const loadPublic = useCallback(() => {
    if (!apiMode || connected.current) return;
    fetchPublic().then((p) => setDb((d) => { d.banks = p.banks; d.batches = p.batches; })).catch((e) => console.warn('[api] public stock', e));
  }, [setDb]);

  const signOut = useCallback((role: Role) => {
    logout(role);
    if (connected.current === role) { connected.current = null; unsub.current(); }
    if (apiMode) setSync({ mode: 'api', status: 'signedout', role });
  }, []);

  // ---- Local mode: keeps portals open in separate tabs in step. ----
  useEffect(() => {
    if (apiMode) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY && e.newValue) { const v = JSON.parse(e.newValue) as DB; latest.current = v; setState(v); }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const local = useActions(setDb);
  const sendRemote = useCallback(async (k: keyof Actions, result: unknown, args: unknown[]) => {
    const send = remote[k] as ((r: unknown, ...a: unknown[]) => Promise<unknown>) | undefined;
    try {
      await send?.(result, ...args);
    } finally {
      // A refused write (no stock, low balance, no permission) is undone by reloading the server's copy.
      await refresh().catch(onFailure);
    }
  }, [refresh, onFailure]);

  const act = useMemo(() => {
    if (!apiMode) return local;
    const wrapped = {} as Record<string, (...a: unknown[]) => unknown>;
    for (const k of Object.keys(local) as (keyof Actions)[]) {
      const fn = local[k] as (...a: unknown[]) => unknown;
      wrapped[k] = (...args: unknown[]) => {
        const result = fn(...args);
        sendRemote(k, result, args).catch((e) => {
          if (e instanceof SignedOut) onFailure(e);
          else setWriteError(e instanceof Error ? e.message : String(e));
        });
        return result;
      };
    }
    return wrapped as unknown as Actions;
  }, [local, sendRemote, onFailure]);

  const confirm = useCallback(async <K extends keyof Actions>(k: K, ...args: Parameters<Actions[K]>) => {
    const fn = local[k] as (...a: unknown[]) => ReturnType<Actions[K]>;
    const result = fn(...args);
    if (apiMode) {
      try { await sendRemote(k, result, args); } catch (e) { if (e instanceof SignedOut) onFailure(e); throw e; }
    }
    return result;
  }, [local, sendRemote, onFailure]);

  const clearWriteError = useCallback(() => setWriteError(null), []);
  const value = useMemo(() => ({ db, act, sync, connect, loadPublic, confirm, signOut, writeError, clearWriteError }),
    [db, act, sync, connect, loadPublic, confirm, signOut, writeError, clearWriteError]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore outside provider');
  return c;
}
