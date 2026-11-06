import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarHeart, Check, ClipboardList, HandHeart, MapPin, Megaphone, Plus, Repeat, Users, Wallet, X } from 'lucide-react';
import { compatibleDonors, COMPONENTS, COMPONENT_KEYS, daysUntilEligible, fmtDate, fmtDT, fmtShort, inr } from '../../data/rules';
import type { BloodGroup, Camp, Component } from '../../data/types';
import { useStore } from '../../store/store';
import { useRole } from '../../layouts/Shell';
import { Badge, Empty, Field, GroupPicker, gl, GroupTag, Modal, Notice, PageHead, Switch, Tabs, useToast } from '../../ui/kit';
import { OrderRow } from './Orders';

const dateIn = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

/* ---------- donor requests ---------- */
export function DonorRequests() {
  const { db, act } = useStore();
  const { role, me, persona } = useRole();
  const toast = useToast();
  const [compose, setCompose] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [form, setForm] = useState({ group: 'O+' as BloodGroup, units: 1, hospital: role === 'referral' ? persona.org : '', city: 'Sangli', note: '', feeSupport: false, neededIn: 1 });
  const donor = db.profile;
  const wait = daysUntilEligible(donor);
  const list = db.requests.filter((r) => r.status === 'open' && (!mineOnly || compatibleDonors(r.group, 'PRBC').includes(donor.group)));

  return (
    <>
      <PageHead title="Donor requests" sub="When a group is short or a family cannot manage, ask willing donors nearby. Donors step forward by choice and are never paid.">
        <button className="btn primary" onClick={() => setCompose(true)}><Plus size={17} /> Ask for donors</button>
      </PageHead>
      {role === 'user' && (
        <div className="row between wrap" style={{ marginBottom: 14 }}>
          <span className="small muted">You are {gl(donor.group)}. {wait > 0 ? `You can donate again in ${wait} days.` : 'You are eligible to donate today.'}</span>
          <label className="row small strong">Only requests I can help <Switch on={mineOnly} onChange={setMineOnly} label="Only requests I can help" /></label>
        </div>
      )}
      <div className="grid g2">
        {list.map((r) => {
          const joined = r.responders.includes(persona.name);
          const compatible = compatibleDonors(r.group, 'PRBC').includes(donor.group);
          return (
            <article className="card pad stack s" key={r.id}>
              <div className="row top">
                <GroupTag g={r.group} size="lg" solid />
                <div className="grow">
                  <div className="row wrap" style={{ gap: 6 }}>
                    <h3 style={{ fontSize: 16 }}>{r.units} donor{r.units > 1 ? 's' : ''} needed</h3>
                    {r.broadcast && <Badge tone="warn"><Megaphone size={11} /> Shortage alert</Badge>}
                    {r.feeSupport && <Badge tone="info">Family needs fee support</Badge>}
                  </div>
                  <div className="small muted row" style={{ gap: 5, marginTop: 3 }}><MapPin size={13} /> {r.hospital}, {r.city}</div>
                  <div className="xs faint">By {fmtDT(r.neededBy)} · asked by {r.byName}</div>
                </div>
              </div>
              <p className="small">{r.note}</p>
              <div className="meter" role="img" aria-label={`${r.responders.length} of ${r.units} donors`}><i className="good" style={{ width: `${Math.min(100, (r.responders.length / r.units) * 100)}%` }} /></div>
              <div className="row between wrap">
                <span className="xs muted">{r.responders.length} of {r.units} donors have stepped forward</span>
                {r.byId === me
                  ? <button className="btn sm" onClick={() => { act.closeRequest(r.id); toast('Request closed'); }}><Check size={14} /> Mark fulfilled</button>
                  : role === 'user' && (joined
                    ? <Badge tone="good"><Check size={12} /> You offered to help</Badge>
                    : <button className="btn sm primary" disabled={!compatible || wait > 0} title={!compatible ? 'Your group cannot help here' : wait > 0 ? 'Not eligible yet' : ''} onClick={() => { act.respond(r.id, persona.name); toast('Thanks. The centre will contact you through chat.'); }}><HandHeart size={14} /> {compatible ? 'I can donate' : 'Different group'}</button>)}
              </div>
            </article>
          );
        })}
        {!list.length && <div className="card" style={{ gridColumn: '1 / -1' }}><Empty icon={<Users size={26} />} title="No open requests right now" /></div>}
      </div>

      {compose && (
        <Modal title="Ask for donors" sub="Your name and number are not shown publicly. Donors reply through the app." onClose={() => setCompose(false)}>
          <div className="stack">
            <div className="field"><span className="label">Blood group</span><GroupPicker value={form.group} onChange={(group) => setForm({ ...form, group })} /></div>
            <div className="grid g2">
              <Field label="Hospital"><input className="input" value={form.hospital} onChange={(e) => setForm({ ...form, hospital: e.target.value })} /></Field>
              <Field label="City"><input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
              <Field label="Donors needed"><input className="input" inputMode="numeric" value={form.units} onChange={(e) => setForm({ ...form, units: Number(e.target.value.replace(/\D/g, '')) })} /></Field>
              <Field label="Needed within (days)"><input className="input" inputMode="numeric" value={form.neededIn} onChange={(e) => setForm({ ...form, neededIn: Number(e.target.value.replace(/\D/g, '')) })} /></Field>
            </div>
            <Field label="A short note"><textarea className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="What should donors know?" /></Field>
            <label className="row between small"><span><b>We need help with the processing charge</b><span className="xs muted" style={{ display: 'block' }}>Raktkoshika reviews this with the centre. Donors never handle money.</span></span><Switch on={form.feeSupport} onChange={(feeSupport) => setForm({ ...form, feeSupport })} label="Needs fee support" /></label>
            <Notice tone="warn">Offering money or gifts to a donor is illegal. Requests that do so are removed.</Notice>
            <button className="btn primary block" disabled={!form.hospital.trim() || form.units < 1} onClick={() => {
              act.postRequest({ byId: me, byName: persona.org, group: form.group, units: form.units, hospital: form.hospital, city: form.city, neededBy: new Date(Date.now() + form.neededIn * 864e5).toISOString(), note: form.note || 'Please help if you can.', feeSupport: form.feeSupport });
              setCompose(false); toast('Request posted to matching donors');
            }}>Post request</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ---------- camps ---------- */
const CAMP_TONE: Record<Camp['status'], 'info' | 'good' | 'warn' | undefined> = { requested: 'warn', accepted: 'good', completed: undefined, declined: undefined };
const CAMP_LABEL: Record<Camp['status'], string> = { requested: 'Waiting for a centre', accepted: 'Confirmed', completed: 'Completed', declined: 'Declined' };

export function CampsPage() {
  const { db, act } = useStore();
  const { role, me, persona } = useRole();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const isBank = role === 'bank';
  const [form, setForm] = useState({ org: role === 'referral' ? persona.org : '', venue: '', city: 'Sangli', date: dateIn(14), target: 50, all: true, bankId: 'b1' });
  const camps = db.camps.filter((c) => c.status !== 'declined');
  const registered = (id: string) => db.donations.some((d) => d.campId === id && d.donorId === me && d.status === 'booked');

  return (
    <>
      <PageHead title={isBank ? 'Camps' : role === 'referral' ? 'Hospital camps' : 'Blood camps'} sub={isBank ? 'Accept camp requests, plan kits and staff, and see the outcome.' : 'Send one request to many centres, or choose one. Donors register in the app.'}>
        {!isBank && <button className="btn primary" onClick={() => setOpen(true)}><Plus size={17} /> Organise a camp</button>}
      </PageHead>
      <div className="grid g3">
        {camps.map((c) => {
          const pct = Math.round(((c.status === 'completed' ? c.collected : c.registered) / c.target) * 100);
          return (
            <article className="card pad stack s" key={c.id}>
              <div className="row between"><Badge tone={CAMP_TONE[c.status]}>{CAMP_LABEL[c.status]}</Badge><span className="xs faint">{fmtDate(c.date)}</span></div>
              <h3 style={{ fontSize: 17 }}>{c.org}</h3>
              <div className="small muted row" style={{ gap: 5 }}><MapPin size={13} /> {c.venue}, {c.city}</div>
              <div className="xs faint">{c.acceptedBy ? `Run by ${db.banks.find((b) => b.id === c.acceptedBy)?.name}` : `Sent to ${c.bankIds.length} centre${c.bankIds.length > 1 ? 's' : ''}`}</div>
              <div className="meter" style={{ marginTop: 4 }} role="img" aria-label={`${pct}% of target`}><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
              <div className="xs muted">{c.status === 'completed' ? `${c.collected} units from ${c.registered} registered` : `${c.registered} registered, target ${c.target}`}</div>
              {isBank && c.status === 'requested' && (
                <div className="row" style={{ marginTop: 6 }}>
                  <button className="btn sm primary grow" onClick={() => { act.campRespond(c.id, 'accepted', me, persona.name); toast('Camp accepted'); }}><Check size={14} /> Accept</button>
                  <button className="btn sm" onClick={() => { act.campRespond(c.id, 'declined', me, persona.name); toast('Camp declined'); }}><X size={14} /> Decline</button>
                </div>
              )}
              {isBank && c.status === 'accepted' && (
                <>
                  <div className="xs muted" style={{ padding: '8px 10px', background: 'var(--surface-3)', borderRadius: 9, marginTop: 4 }}>Plan: {Math.ceil(c.target * 1.15)} bags, {Math.ceil(c.target * 1.15)} test kits, {Math.max(3, Math.ceil(c.target / 25))} staff</div>
                  <button className="btn sm" onClick={() => { act.campRespond(c.id, 'completed', me, persona.name); toast('Camp closed'); }}>Close camp</button>
                </>
              )}
              {role === 'user' && c.status === 'accepted' && (registered(c.id)
                ? <Badge tone="good"><Check size={12} /> You are registered</Badge>
                : <button className="btn sm primary" onClick={() => { act.bookDonation(c.acceptedBy!, c.date, '10:00 am', c.id); toast('You are registered for this camp'); }}>Register to donate</button>)}
            </article>
          );
        })}
        {!camps.length && <div className="card" style={{ gridColumn: '1 / -1' }}><Empty icon={<CalendarHeart size={26} />} title="No camps yet" /></div>}
      </div>

      {open && (
        <Modal title="Organise a blood camp" sub="We suggest a target from the venue size. The centre brings staff, bags and tests." onClose={() => setOpen(false)}>
          <div className="stack">
            <Field label="Organisation"><input className="input" value={form.org} onChange={(e) => setForm({ ...form, org: e.target.value })} placeholder="College, company, society…" /></Field>
            <div className="grid g2">
              <Field label="Venue"><input className="input" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></Field>
              <Field label="City"><input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
              <Field label="Date"><input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
              <Field label="Target donors"><input className="input" inputMode="numeric" value={form.target} onChange={(e) => setForm({ ...form, target: Number(e.target.value.replace(/\D/g, '')) })} /></Field>
            </div>
            <div className="field">
              <span className="label">Send the request to</span>
              <div className="grid g2" style={{ gap: 8 }}>
                <button className={`choice ${form.all ? 'on' : ''}`} onClick={() => setForm({ ...form, all: true })}><span className="tick" /><span><b>All nearby centres</b><span className="xs muted" style={{ display: 'block' }}>The first to accept runs it</span></span></button>
                <button className={`choice ${!form.all ? 'on' : ''}`} onClick={() => setForm({ ...form, all: false })}><span className="tick" /><span><b>One centre</b><span className="xs muted" style={{ display: 'block' }}>Choose below</span></span></button>
              </div>
              {!form.all && <select className="select" aria-label="Centre" value={form.bankId} onChange={(e) => setForm({ ...form, bankId: e.target.value })}>{db.banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
            </div>
            <button className="btn primary block" disabled={!form.org.trim() || !form.venue.trim() || form.target < 1} onClick={() => {
              act.requestCamp({ org: form.org, requestedBy: me, venue: form.venue, city: form.city, date: new Date(form.date).toISOString(), target: form.target, bankIds: form.all ? db.banks.filter((b) => b.km < 60).map((b) => b.id) : [form.bankId] });
              setOpen(false); toast('Camp request sent');
            }}>Send request</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ---------- regular transfusion plans ---------- */
export function PlansPage() {
  const { db, act } = useStore();
  const { me, persona, base } = useRole();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ patient: '', group: 'B+' as BloodGroup, component: 'PRBC' as Component, units: 1, everyDays: 21, bankId: 'b1' });
  const plans = db.plans.filter((p) => p.ownerId === me);
  return (
    <>
      <PageHead title="Regular transfusions" sub="For thalassaemia, sickle cell and other long-term care. Set it once and the next units are booked and reminded for you.">
        <button className="btn primary" onClick={() => setOpen(true)}><Plus size={17} /> New plan</button>
      </PageHead>
      <div className="grid g2">
        {plans.map((p) => {
          const bank = db.banks.find((b) => b.id === p.bankId);
          const stock = db.batches.filter((u) => u.bankId === p.bankId && u.status === 'available' && u.group === p.group && u.component === p.component).length;
          return (
            <article className="card pad stack s" key={p.id}>
              <div className="row top">
                <GroupTag g={p.group} size="lg" solid />
                <div className="grow"><h3 style={{ fontSize: 17 }}>{p.patient}</h3><div className="small muted">{p.units} × {COMPONENTS[p.component].short}, every {p.everyDays} days</div><div className="xs faint">{bank?.name}</div></div>
                <Switch on={p.active} onChange={() => act.togglePlan(p.id)} label="Plan active" />
              </div>
              <div className="row between" style={{ padding: '11px 13px', background: 'var(--surface-3)', borderRadius: 12 }}>
                <div><div className="xs faint">Next transfusion</div><div className="strong">{fmtShort(p.next)}</div></div>
                <div className="right"><div className="xs faint">Stock at centre</div><div className="strong">{stock} unit{stock === 1 ? '' : 's'}</div></div>
              </div>
              {stock < p.units && p.active && <Notice tone="warn">Stock is low for this date. <Link to={`${base}/donor-requests`} style={{ fontWeight: 600 }}>Ask for donors</Link> early.</Notice>}
            </article>
          );
        })}
        {!plans.length && <div className="card" style={{ gridColumn: '1 / -1' }}><Empty icon={<Repeat size={26} />} title="No plans yet">Set one up for a family member who needs regular blood.</Empty></div>}
      </div>
      {open && (
        <Modal title="New transfusion plan" onClose={() => setOpen(false)}>
          <div className="stack">
            <Field label="Patient’s name"><input className="input" value={f.patient} onChange={(e) => setF({ ...f, patient: e.target.value })} /></Field>
            <div className="field"><span className="label">Blood group</span><GroupPicker value={f.group} onChange={(group) => setF({ ...f, group })} /></div>
            <div className="grid g2">
              <Field label="Component"><select className="select" value={f.component} onChange={(e) => setF({ ...f, component: e.target.value as Component })}>{COMPONENT_KEYS.map((c) => <option key={c} value={c}>{COMPONENTS[c].name}</option>)}</select></Field>
              <Field label="Every (days)"><input className="input" inputMode="numeric" value={f.everyDays} onChange={(e) => setF({ ...f, everyDays: Number(e.target.value.replace(/\D/g, '')) })} /></Field>
              <Field label="Units each time"><input className="input" inputMode="numeric" value={f.units} onChange={(e) => setF({ ...f, units: Number(e.target.value.replace(/\D/g, '')) })} /></Field>
              <Field label="Blood centre"><select className="select" value={f.bankId} onChange={(e) => setF({ ...f, bankId: e.target.value })}>{db.banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
            </div>
            <button className="btn primary block" disabled={!f.patient.trim() || f.everyDays < 1 || f.units < 1} onClick={() => {
              act.addPlan({ ownerId: me, patient: f.patient, group: f.group, component: f.component, units: f.units, everyDays: f.everyDays, bankId: f.bankId, next: new Date(Date.now() + f.everyDays * 864e5).toISOString() });
              setOpen(false); toast(`Plan created by ${persona.name}`);
            }}>Create plan</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ---------- history ---------- */
export function HistoryPage() {
  const { db } = useStore();
  const { me, base } = useRole();
  const [tab, setTab] = useState<'orders' | 'donations' | 'money'>('orders');
  const orders = db.orders.filter((o) => o.ownerId === me);
  const donations = db.donations.filter((d) => d.donorId === me);
  const ledger = db.wallets[me]?.ledger ?? [];
  const spent = orders.filter((o) => o.payment.settled).reduce((s, o) => s + o.payment.cash, 0);
  return (
    <>
      <PageHead title="History" sub="Everything you have ordered, donated and paid, kept for as long as you need it." />
      <div className="grid g3" style={{ marginBottom: 16 }}>
        <div className="card stat"><div className="k"><ClipboardList size={15} /> Orders</div><div className="v">{orders.length}</div></div>
        <div className="card stat"><div className="k"><HandHeart size={15} /> Donations</div><div className="v">{donations.filter((d) => d.status === 'completed').length}</div></div>
        <div className="card stat"><div className="k"><Wallet size={15} /> Charges paid</div><div className="v">{inr(spent)}</div></div>
      </div>
      <div className="card">
        <div style={{ padding: '4px 12px 0' }}><Tabs value={tab} onChange={setTab} items={[{ k: 'orders', label: 'Orders' }, { k: 'donations', label: 'Donations' }, { k: 'money', label: 'Money' }]} /></div>
        {tab === 'orders' && orders.map((o) => <OrderRow key={o.id} o={o} to={`${base}/orders/${o.id}`} />)}
        {tab === 'donations' && donations.map((d) => (
          <div className="list-row" key={d.id}>
            <GroupTag g={d.group} />
            <div className="grow"><div className="strong">{db.banks.find((b) => b.id === d.bankId)?.name}</div><div className="xs faint">{fmtDate(d.date)} · {d.slot}</div></div>
            <Badge tone={d.status === 'completed' ? 'good' : d.status === 'deferred' ? 'warn' : undefined}>{d.status === 'completed' ? 'Donated' : d.status === 'deferred' ? 'Deferred' : d.status === 'booked' ? 'Booked' : 'Cancelled'}</Badge>
          </div>
        ))}
        {tab === 'money' && ledger.map((l) => (
          <div className="list-row" key={l.id}>
            <div className="grow"><div className="strong" style={{ fontSize: 14 }}>{l.note}</div><div className="xs faint">{fmtDT(l.at)}</div></div>
            <div className="strong num">{l.credits ? `${l.credits > 0 ? '+' : '−'}${Math.abs(l.credits)} credit` : inr(l.amount)}</div>
          </div>
        ))}
        {((tab === 'orders' && !orders.length) || (tab === 'donations' && !donations.length) || (tab === 'money' && !ledger.length)) && <Empty title="Nothing here yet" />}
      </div>
    </>
  );
}

