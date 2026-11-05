import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Banknote, Building2, Check, FileCheck2, LifeBuoy, MapPin, Plus, Target, TriangleAlert } from 'lucide-react';
import { ago, fmtDate, inr } from '../../data/rules';
import type { LeadStage } from '../../data/types';
import { useStore } from '../../store/store';
import { useRole } from '../../layouts/Shell';
import { Badge, BarChart, Empty, Field, Modal, Notice, PageHead, Stat, useToast } from '../../ui/kit';

const STAGES: LeadStage[] = ['Lead', 'Demo done', 'Documents', 'Live'];
const EARN = [{ k: 'Jun', v: 11200 }, { k: 'Jul', v: 14400 }, { k: 'Aug', v: 17250 }, { k: 'Sep', v: 21500 }, { k: 'Oct', v: 28750 }];
const TERRITORY = ['Sangli', 'Kolhapur', 'Satara'];

export function FranchiseHome() {
  const { db } = useStore();
  const { base } = useRole();
  const leads = db.leads;
  const centres = db.banks.filter((b) => TERRITORY.includes(b.district));
  const pending = db.applications.filter((a) => a.status === 'pending');
  const openTickets = db.tickets.filter((t) => t.status === 'open').length;
  return (
    <>
      <PageHead title="South Maharashtra" sub={`Your territory: ${TERRITORY.join(', ')}`}>
        <Link className="btn primary" to={`${base}/centres`}><Plus size={17} /> Add a centre</Link>
      </PageHead>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat icon={<Building2 size={15} />} label="Live centres" value={centres.length} sub={`${TERRITORY.length} districts`} />
        <Stat icon={<Target size={15} />} label="Open leads" value={leads.filter((l) => l.stage !== 'Live').length} sub={`${leads.filter((l) => l.stage === 'Documents').length} at documents`} />
        <Stat icon={<FileCheck2 size={15} />} label="Waiting for HQ" value={pending.length} sub="Licence checks" />
        <Stat icon={<Banknote size={15} />} label="October share" value={inr(28750)} sub="Sample figure" />
      </div>
      <div className="grid g-main">
        <section className="card">
          <div className="card-head"><h3>Your earnings</h3><Link className="link" to={`${base}/earnings`}>Details <ArrowRight size={14} /></Link></div>
          <div className="card-body"><BarChart label="Monthly revenue share" data={EARN} format={inr} /></div>
        </section>
        <section className="card">
          <div className="card-head"><h3>Coverage</h3><span className="xs faint">Live centres by district</span></div>
          {TERRITORY.map((d) => {
            const n = centres.filter((b) => b.district === d).length;
            return <div className="list-row" key={d}><MapPin size={16} className="brand-text" /><div className="grow strong">{d}</div><Badge tone={n > 1 ? 'good' : 'warn'}>{n} centre{n === 1 ? '' : 's'}</Badge></div>;
          })}
          <div className="list-row"><LifeBuoy size={16} className="faint" /><div className="grow small muted">{openTickets} support tickets open</div><Link className="link" to={`${base}/support`}>Open</Link></div>
        </section>
      </div>
    </>
  );
}

export function Pipeline() {
  const { db, act } = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', city: '', contact: '', plan: 'Centre · Model 1' });
  const move = (id: string, stage: LeadStage, dir: number) => {
    const next = STAGES[STAGES.indexOf(stage) + dir];
    if (next) { act.moveLead(id, next); toast(`Moved to ${next}`); }
  };
  return (
    <>
      <PageHead title="Sales pipeline" sub="Move each centre or hospital from first talk to going live.">
        <button className="btn primary" onClick={() => setOpen(true)}><Plus size={17} /> New lead</button>
      </PageHead>
      <div className="board">
        {STAGES.map((s) => {
          const list = db.leads.filter((l) => l.stage === s);
          return (
            <section className="lane" key={s} aria-label={s}>
              <h4>{s} <span className="faint">{list.length}</span></h4>
              {list.map((l) => (
                <article className="card" style={{ padding: 13 }} key={l.id}>
                  <b style={{ fontSize: 14 }}>{l.name}</b>
                  <div className="xs muted">{l.city} · {l.contact}</div>
                  <div className="row between" style={{ marginTop: 8 }}>
                    <Badge>{l.plan}</Badge>
                    <div className="row" style={{ gap: 2 }}>
                      {s !== 'Lead' && s !== 'Live' && <button className="btn sm icon quiet" aria-label={`Move ${l.name} back`} onClick={() => move(l.id, s, -1)}><ArrowLeft size={14} /></button>}
                      {s !== 'Live' && s !== 'Documents' && <button className="btn sm icon quiet" aria-label={`Move ${l.name} forward`} onClick={() => move(l.id, s, 1)}><ArrowRight size={14} /></button>}
                    </div>
                  </div>
                </article>
              ))}
            </section>
          );
        })}
      </div>
      <p className="xs faint" style={{ marginTop: 10 }}>A centre moves from Documents to Live only after Raktkoshika verifies its licence.</p>
      {open && (
        <Modal title="New lead" onClose={() => setOpen(false)}>
          <div className="stack">
            <Field label="Organisation"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <div className="grid g2">
              <Field label="City"><input className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
              <Field label="Contact"><input className="input" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field>
            </div>
            <Field label="Likely plan"><select className="select" value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}>{['Centre · Model 1', 'Centre · Model 3', 'Centre · Master', 'Referral · Monthly', 'Referral · Yearly'].map((p) => <option key={p}>{p}</option>)}</select></Field>
            <button className="btn primary block" disabled={!f.name.trim() || !f.city.trim()} onClick={() => { act.addLead(f.name, f.city, f.contact || 'Not given', f.plan); setOpen(false); setF({ name: '', city: '', contact: '', plan: 'Centre · Model 1' }); toast('Lead added'); }}>Add lead</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function FranchiseCentres() {
  const { db, act } = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', city: '', license: '' });
  const live = db.banks.filter((b) => TERRITORY.includes(b.district));
  return (
    <>
      <PageHead title="Centres & onboarding" sub="Submit documents for new centres and follow their approval.">
        <button className="btn primary" onClick={() => setOpen(true)}><Plus size={17} /> New application</button>
      </PageHead>
      <div className="grid g-main">
        <section className="card table-wrap">
          <table className="table">
            <thead><tr><th>Live centre</th><th>District</th><th>Type</th><th className="r">Units</th><th>Stock update</th></tr></thead>
            <tbody>{live.map((b) => (
              <tr key={b.id}><td className="strong">{b.name}</td><td>{b.district}</td><td>{b.type}</td><td className="r num">{db.batches.filter((u) => u.bankId === b.id && u.status === 'available').length}</td><td>{b.syncMin > 30 ? <Badge tone="warn"><TriangleAlert size={11} /> {b.syncMin} min</Badge> : <Badge tone="good">{b.syncMin} min</Badge>}</td></tr>
            ))}</tbody>
          </table>
        </section>
        <section className="card">
          <div className="card-head"><h3>Applications</h3></div>
          {db.applications.map((a) => (
            <div className="list-row" key={a.id} style={{ alignItems: 'flex-start' }}>
              <div className="grow"><b style={{ fontSize: 14 }}>{a.name}</b><div className="xs muted">{a.city} · {fmtDate(a.at)}</div>
                {a.docs.some((d) => !d.ok) && <div className="xs" style={{ color: 'var(--warn)', marginTop: 3 }}>Missing: {a.docs.filter((d) => !d.ok).map((d) => d.name).join(', ')}</div>}
              </div>
              <Badge tone={a.status === 'approved' ? 'good' : a.status === 'rejected' ? 'crit' : 'warn'}>{a.status === 'approved' ? 'Live' : a.status === 'rejected' ? 'Sent back' : 'With HQ'}</Badge>
            </div>
          ))}
        </section>
      </div>
      {open && (
        <Modal title="New centre application" sub="Goes to Raktkoshika HQ for licence verification." onClose={() => setOpen(false)}>
          <div className="stack">
            <Field label="Centre name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <div className="grid g2">
              <Field label="City"><input className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
              <Field label="FDA licence number"><input className="input" value={f.license} onChange={(e) => setF({ ...f, license: e.target.value })} /></Field>
            </div>
            <div className="stack s small">{['FDA blood centre licence', 'SBTC registration', 'Medical officer registration', 'e-RaktKosh ID'].map((d) => <div className="row" key={d}><Check size={15} color="var(--good)" /> {d} <span className="faint">(sample file attached)</span></div>)}</div>
            <button className="btn primary block" disabled={!f.name.trim() || !f.city.trim() || !f.license.trim()} onClick={() => { act.submitApplication(f.name, f.city, f.license); setOpen(false); setF({ name: '', city: '', license: '' }); toast('Application sent to HQ'); }}>Submit application</button>
          </div>
        </Modal>
      )}
    </>
  );
}

export function FranchiseEarnings() {
  const { db, act } = useStore();
  const { me } = useRole();
  const toast = useToast();
  const w = db.wallets[me];
  const lines = db.leads.filter((l) => l.stage === 'Live');
  const fee = (plan: string) => (plan.includes('Master') ? 2000 : plan.includes('Centre') ? 500 : 500);
  const total = lines.reduce((s, l) => s + fee(l.plan), 0);
  return (
    <>
      <PageHead title="Earnings" sub="Your share comes from software plans only, never from blood or processing charges.">
        <button className="btn primary" disabled={w.balance <= 0} onClick={() => { act.settle(me, w.balance); toast('Transfer started'); }}><Banknote size={16} /> Pay out {inr(w.balance)}</button>
      </PageHead>
      <div className="grid g-main">
        <section className="card"><div className="card-head"><h3>Monthly share</h3><span className="xs faint">Sample figures</span></div><div className="card-body"><BarChart label="Monthly revenue share" data={EARN} format={inr} height={220} /></div></section>
        <section className="card">
          <div className="card-head"><h3>Plans in your territory</h3></div>
          {lines.map((l) => <div className="list-row" key={l.id}><div className="grow"><b style={{ fontSize: 14 }}>{l.name}</b><div className="xs muted">{l.plan}</div></div><span className="num strong">{inr(fee(l.plan))}/mo</span></div>)}
          <div className="list-row"><b className="grow">Plan value</b><b className="num">{inr(total)}/mo</b></div>
        </section>
      </div>
      <div style={{ marginTop: 14 }}><Notice tone="info">The revenue share percentage is not in the proposal yet. Chart figures are placeholders until Raktkoshika decides it.</Notice></div>
    </>
  );
}

export function SupportPage() {
  const { db, act } = useStore();
  const { role, persona } = useRole();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  return (
    <>
      <PageHead title="Support" sub={role === 'admin' ? 'Issues raised across the network.' : 'Issues from your centres. We reply within a working day.'}>
        <button className="btn primary" onClick={() => setOpen(true)}><Plus size={17} /> New ticket</button>
      </PageHead>
      <section className="card">
        {db.tickets.map((t) => (
          <div className="list-row" key={t.id}>
            <div className="grow"><div className="row wrap" style={{ gap: 6 }}><b style={{ fontSize: 14 }}>{t.subject}</b>{t.priority === 'High' && t.status === 'open' && <Badge tone="crit">High</Badge>}</div><div className="xs muted">{t.from} · {t.id} · {ago(t.at)}</div></div>
            {t.status === 'open' ? <button className="btn sm" onClick={() => { act.resolveTicket(t.id); toast('Ticket resolved'); }}><Check size={14} /> Resolve</button> : <Badge tone="good">Resolved</Badge>}
          </div>
        ))}
        {!db.tickets.length && <Empty icon={<LifeBuoy size={26} />} title="No tickets" />}
      </section>
      {open && (
        <Modal title="New support ticket" onClose={() => setOpen(false)}>
          <div className="stack">
            <Field label="What is the issue?"><textarea className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
            <button className="btn primary block" disabled={!subject.trim()} onClick={() => { act.addTicket(persona.org, subject.trim()); setOpen(false); setSubject(''); toast('Ticket created'); }}>Create ticket</button>
          </div>
        </Modal>
      )}
    </>
  );
}
