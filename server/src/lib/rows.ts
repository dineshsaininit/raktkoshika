/**
 * Turns database rows into the exact shapes the frontend uses (src/data/types.ts).
 * Timestamps go out as ISO strings, optional fields are left out when empty.
 */
type R = Record<string, any>;
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : d == null ? undefined : String(d));
const opt = <T>(v: T | null | undefined) => (v == null ? undefined : v);

export const bankOut = (r: R) => ({
  id: r.id, name: r.name, city: r.city, district: r.district, type: r.type, license: r.license, km: Number(r.km), rating: Number(r.rating),
  open24: r.open24, verified: r.verified, syncMin: r.sync_min, parentId: opt(r.parent_id), phone: r.phone,
});

export const batchOut = (r: R) => ({
  id: r.id, bankId: r.bank_id, group: r.grp, component: r.component, collected: iso(r.collected), expiry: iso(r.expiry),
  status: r.status, source: r.source, orderId: opt(r.order_id), discardReason: opt(r.discard_reason),
});

export const orderOut = (r: R, events: R[] = []) => ({
  id: r.id, ownerId: r.owner_id, kind: r.kind, urgency: r.urgency,
  patient: { name: r.patient_name, age: r.patient_age, hospital: r.hospital, ward: r.ward, doctor: r.doctor },
  group: r.grp, component: r.component, units: r.units, bankId: r.bank_id, scheduledFor: iso(r.scheduled_for), seriesId: opt(r.series_id),
  fulfilment: r.fulfilment, rx: r.rx, rxFileId: opt(r.rx_file_id), stage: r.stage,
  events: events.map((e) => ({ stage: e.stage, at: iso(e.at), note: opt(e.note) })),
  payment: { method: r.pay_method, fee: r.fee, total: r.total, creditsUsed: r.credits_used, cash: r.cash, settled: r.settled },
  reaction: opt(r.reaction),
});

export const ledgerOut = (r: R) => ({ id: r.id, at: iso(r.at), kind: r.kind, amount: r.amount, credits: r.credits, note: r.note, ref: opt(r.ref) });

export const donationOut = (r: R) => ({
  id: r.id, donorId: r.donor_id, donorName: r.donor_name, group: r.grp, bankId: r.bank_id, date: iso(r.date), slot: r.slot,
  status: r.status, hb: r.hb == null ? undefined : Number(r.hb), note: opt(r.note), campId: opt(r.camp_id),
});

export const campOut = (r: R) => ({
  id: r.id, org: r.org, requestedBy: r.requested_by, venue: r.venue, city: r.city, date: iso(r.date), target: r.target,
  bankIds: r.bank_ids, acceptedBy: opt(r.accepted_by), status: r.status, registered: r.registered, collected: r.collected,
});

export const requestOut = (r: R) => ({
  id: r.id, byId: r.by_id, byName: r.by_name, group: r.grp, units: r.units, hospital: r.hospital, city: r.city, neededBy: iso(r.needed_by),
  note: r.note, feeSupport: r.fee_support, responders: r.responders, status: r.status, broadcast: r.broadcast || undefined,
});

export const threadOut = (r: R, msgs: R[] = []) => ({
  id: r.id, title: r.title, subtitle: r.subtitle, members: r.members, kind: r.kind,
  messages: msgs.map((m) => ({ id: m.id, from: m.from_id, text: m.text, at: iso(m.at) })),
});

export const noticeOut = (r: R) => ({ id: r.id, to: r.to_role, title: r.title, body: r.body, at: iso(r.at), read: r.read, link: opt(r.link), tone: r.tone });
export const referralOut = (r: R) => ({ id: r.id, bankId: r.bank_id, name: r.name, kind: r.kind, city: r.city, plan: r.plan, units: r.units, status: r.status, contact: r.contact });
export const accountOut = (r: R) => ({ id: r.id, bankId: r.bank_id, at: iso(r.at), kind: r.kind, head: r.head, amount: r.amount, ref: opt(r.ref) });
export const applicationOut = (r: R) => ({
  id: r.id, name: r.name, city: r.city, district: r.district, license: r.license, docs: r.docs, franchiseId: r.franchise_id, status: r.status, at: iso(r.at), type: r.type,
});
export const leadOut = (r: R) => ({ id: r.id, name: r.name, city: r.city, contact: r.contact, stage: r.stage, plan: r.plan });
export const ticketOut = (r: R) => ({ id: r.id, from: r.from_org, subject: r.subject, priority: r.priority, status: r.status, at: iso(r.at) });
export const auditOut = (r: R) => ({ id: r.id, at: iso(r.at), actor: r.actor, action: r.action, target: r.target });
export const planOut = (r: R) => ({
  id: r.id, ownerId: r.owner_id, patient: r.patient, group: r.grp, component: r.component, units: r.units, everyDays: r.every_days, bankId: r.bank_id, next: iso(r.next), active: r.active,
});
export const sensorOut = (r: R) => ({ id: r.id, bankId: r.bank_id, name: r.name, kind: r.kind, temp: Number(r.temp), min: Number(r.min), max: Number(r.max) });

export const profileOut = (r: R, family: R[] = []) => ({
  id: r.id, name: r.name, phone: r.phone, city: r.city, group: r.grp, age: r.age, weight: Number(r.weight), sex: r.sex,
  lastDonation: iso(r.last_donation), donorActive: r.donor_active, rareDonor: r.rare_donor, shareContact: r.share_contact,
  family: family.map((f) => ({ id: f.id, name: f.name, relation: f.relation, group: f.grp })),
});
