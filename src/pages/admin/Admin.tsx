import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowRight, Building2, Check, CircleCheck, CircleDashed, Clock, Droplets, FileCheck2, Megaphone, ReceiptIndianRupee, Scale, Search, ShieldCheck, Users, Wallet, X } from 'lucide-react';
import { ago, COMPONENTS, COMPONENT_KEYS, daysLeft, downloadCsv, FEES, fmtDT, GROUPS, inr } from '../../data/rules';
import type { BloodGroup, Component } from '../../data/types';
import { DEMO_ACCOUNTS } from '../../data/demoAccounts';
import { useStore } from '../../store/store';
import { useRole } from '../../layouts/Shell';
import { Badge, Empty, gl, LineChart, Notice, PageHead, Stat, Tabs, useToast } from '../../ui/kit';
import { BroadcastModal } from '../bank/Operations';

export function AdminHome() {
  const { db } = useStore();
  const { base, me } = useRole();
  const [alert, setAlert] = useState<BloodGroup | null>(null);
  const shelf = db.batches.filter((u) => u.status === 'available');
  const open = db.orders.filter((o) => !['completed', 'rejected', 'cancelled'].includes(o.stage));
  const walletTotal = Object.values(db.wallets).reduce((s, w) => s + w.balance + w.held, 0);
  const stale = db.banks.filter((b) => b.syncMin > 30);
  const pending = db.applications.filter((a) => a.status === 'pending');
  const atRisk = shelf.filter((u) => daysLeft(u.expiry) <= 3).length;
  const scarce = GROUPS.map((g) => ({ g, n: shelf.filter((u) => u.group === g && u.component === 'PRBC').length })).sort((a, b) => a.n - b.n).slice(0, 3);
  return (
    <>
      <PageHead title="Command centre" sub="The whole network at a glance.">
        <button className="btn primary" onClick={() => setAlert(scarce[0].g)}><Megaphone size={16} /> Shortage alert</button>
      </PageHead>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat icon={<Building2 size={15} />} label="Verified centres" value={db.banks.filter((b) => b.verified).length} sub={`${pending.length} waiting for checks`} />
        <Stat icon={<Droplets size={15} />} label="Units available" value={shelf.length} sub={`${atRisk} expiring within 3 days`} />
        <Stat icon={<Activity size={15} />} label="Open requests" value={open.length} sub={`${open.filter((o) => o.urgency === 'sos').length} emergency`} />
        <Stat icon={<Wallet size={15} />} label="Held in wallets" value={inr(walletTotal)} sub="Across all accounts" />
      </div>
      <div className="grid g-main">
        <div className="stack">
          <section className="card">
            <div className="card-head"><h3>Network collected and issued</h3><span className="xs faint">Units per month, sample data</span></div>
            <div className="card-body"><LineChart label="Network units collected and issued" x={db.months.map((m) => m.m)} series={[{ name: 'Collected', color: 'var(--s2)', values: db.months.map((m) => m.collected * 6) }, { name: 'Issued', color: 'var(--s1)', values: db.months.map((m) => m.issued * 6) }]} /></div>
          </section>
          <section className="card">
            <div className="card-head"><h3>Live activity</h3><Link className="link" to={`${base}/compliance`}>Full audit <ArrowRight size={14} /></Link></div>
            {db.audit.slice(0, 7).map((a) => (
              <div className="list-row" key={a.id} style={{ padding: '10px 20px' }}><i className="dot" style={{ color: 'var(--brand)' }} /><div className="grow small"><b>{a.actor}</b> <span className="muted">{a.action.toLowerCase()}</span> <span className="strong">{a.target}</span></div><span className="xs faint" style={{ flexShrink: 0 }}>{ago(a.at)}</span></div>
            ))}
          </section>
        </div>
        <div className="stack">
          <section className="card">
            <div className="card-head"><h3>Scarcest red cells</h3></div>
            {scarce.map((s) => <div className="list-row" key={s.g}><b style={{ font: '800 18px var(--display)', width: 44 }}>{gl(s.g)}</b><div className="grow small muted">{s.n} units in the network</div><button className="btn sm" onClick={() => setAlert(s.g)}>Alert</button></div>)}
          </section>
          <section className="card">
            <div className="card-head"><h3>Needs attention</h3></div>
            {pending.length > 0 && <Link className="list-row" to={`${base}/verification`}><FileCheck2 size={18} className="brand-text" /><div className="grow"><b style={{ fontSize: 14 }}>{pending.length} centre applications</b><div className="xs muted">Licence checks waiting</div></div><ArrowRight size={15} /></Link>}
            {stale.map((b) => <Link key={b.id} className="list-row" to={`${base}/network`}><Clock size={18} style={{ color: 'var(--warn)' }} /><div className="grow"><b style={{ fontSize: 14 }}>{b.name}</b><div className="xs muted">Stock not updated for {b.syncMin} minutes</div></div><ArrowRight size={15} /></Link>)}
            {!pending.length && !stale.length && <Empty icon={<Check size={24} />} title="All clear" />}
          </section>
        </div>
      </div>
      {alert && <BroadcastModal initial={alert} from={me} onClose={() => setAlert(null)} />}
    </>
  );
}

export function AdminNetwork() {
  const { db } = useStore();
  const [comp, setComp] = useState<Component>('PRBC');
  const [q, setQ] = useState('');
  const banks = db.banks.filter((b) => b.verified && `${b.name} ${b.city} ${b.district}`.toLowerCase().includes(q.toLowerCase()));
  const count = (b: string, g: BloodGroup) => db.batches.filter((u) => u.bankId === b && u.group === g && u.component === comp && u.status === 'available').length;
  const shade = (n: number) => (n === 0 ? { background: 'var(--crit-soft)', color: 'var(--crit)' } : n <= 2 ? { background: 'var(--warn-soft)', color: 'var(--warn)' } : { background: 'var(--surface-3)' });
  return (
    <>
      <PageHead title="Network stock" sub="See where stock is thin, and where surplus could help. Red means none. Amber means two or fewer." />
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <div className="search grow" style={{ minWidth: 220 }}><Search size={16} /><input className="input" placeholder="Search centre or district" aria-label="Search centres" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="chips">{COMPONENT_KEYS.map((c) => <button key={c} className={`chip ${comp === c ? 'on' : ''}`} onClick={() => setComp(c)}>{COMPONENTS[c].short}</button>)}</div>
      </div>
      <section className="card pad table-wrap">
        <div className="heat" style={{ gridTemplateColumns: '220px repeat(8, minmax(44px, 1fr)) 90px', minWidth: 760 }}>
          <div className="h" style={{ textAlign: 'left' }}>Centre</div>
          {GROUPS.map((g) => <div className="h" key={g}>{gl(g)}</div>)}
          <div className="h">Updated</div>
          {banks.map((b) => (
            <Fragment key={b.id}>
              <div className="n" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '3px 0' }}><span className="truncate" style={{ maxWidth: 210 }}>{b.name}</span><span className="xs faint" style={{ fontWeight: 400 }}>{b.district} · {b.type}</span></div>
              {GROUPS.map((g) => { const n = count(b.id, g); return <div className="c" key={g} style={shade(n)}>{n}</div>; })}
              <div className="c" style={b.syncMin > 30 ? { color: 'var(--warn)' } : { color: 'var(--ink-3)', fontWeight: 400 }}>{b.syncMin} min</div>
            </Fragment>
          ))}
        </div>
      </section>
    </>
  );
}

export function AdminVerification() {
  const { db, act } = useStore();
  const toast = useToast();
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const list = db.applications.filter((a) => (tab === 'pending' ? a.status === 'pending' : a.status !== 'pending'));
  return (
    <>
      <PageHead title="Verification" sub="Only licensed centres reach the public. Check every document before approving." />
      <div style={{ marginBottom: 14 }}><Tabs value={tab} onChange={setTab} items={[{ k: 'pending', label: 'Waiting', n: db.applications.filter((a) => a.status === 'pending').length }, { k: 'done', label: 'Decided' }]} /></div>
      <div className="grid g2">
        {list.map((a) => {
          const complete = a.docs.every((d) => d.ok);
          return (
            <article className="card pad stack s" key={a.id}>
              <div className="row between top"><div><h3 style={{ fontSize: 17 }}>{a.name}</h3><div className="small muted">{a.city} · {a.type} · {a.license}</div></div><Badge tone={a.status === 'approved' ? 'good' : a.status === 'rejected' ? 'crit' : complete ? 'info' : 'warn'}>{a.status === 'pending' ? (complete ? 'Ready' : 'Incomplete') : a.status === 'approved' ? 'Approved' : 'Sent back'}</Badge></div>
              <div className="stack s small" style={{ margin: '6px 0' }}>{a.docs.map((d) => <div className="row" key={d.name}>{d.ok ? <CircleCheck size={16} color="var(--good)" /> : <CircleDashed size={16} color="var(--warn)" />}<span className={d.ok ? '' : 'strong'}>{d.name}{d.ok ? '' : ' is missing'}</span></div>)}</div>
              {a.status === 'pending' && (
                <div className="row">
                  <button className="btn sm" onClick={() => { act.decideApplication(a.id, 'rejected'); toast('Sent back to the franchise'); }}><X size={14} /> Send back</button>
                  <button className="btn sm primary grow" disabled={!complete} title={complete ? '' : 'All documents are needed'} onClick={() => { act.decideApplication(a.id, 'approved'); toast(`${a.name} is now live`); }}><ShieldCheck size={14} /> Approve</button>
                </div>
              )}
            </article>
          );
        })}
        {!list.length && <div className="card" style={{ gridColumn: '1 / -1' }}><Empty icon={<ShieldCheck size={26} />} title="Nothing waiting" /></div>}
      </div>
    </>
  );
}

const OWNER_NAME: Record<string, string> = Object.fromEntries(DEMO_ACCOUNTS.map((a) => [a.id, a.role === 'user' ? a.name : a.org]));

export function AdminLedger() {
  const { db } = useStore();
  const rows = useMemo(() => Object.values(db.wallets).flatMap((w) => w.ledger.map((l) => ({ ...l, owner: OWNER_NAME[w.ownerId] ?? db.banks.find((b) => b.id === w.ownerId)?.name ?? w.ownerId }))).sort((a, b) => b.at.localeCompare(a.at)), [db.wallets, db.banks]);
  const held = Object.values(db.wallets).reduce((s, w) => s + w.held, 0);
  const avail = Object.values(db.wallets).reduce((s, w) => s + w.balance, 0);
  const credits = Object.values(db.wallets).reduce((s, w) => s + w.credits + w.creditsHeld, 0);
  return (
    <>
      <PageHead title="Wallet ledger" sub="Every rupee and credit in the network, in one traceable list.">
        <button className="btn" onClick={() => downloadCsv('wallet-ledger.csv', [['Time', 'Account', 'Type', 'Amount', 'Credits', 'Note'], ...rows.map((r) => [fmtDT(r.at), r.owner, r.kind, r.amount, r.credits, r.note])])}>Export</button>
      </PageHead>
      <div className="grid g3" style={{ marginBottom: 16 }}>
        <Stat icon={<Wallet size={15} />} label="Available balances" value={inr(avail)} />
        <Stat icon={<ReceiptIndianRupee size={15} />} label="Held for open orders" value={inr(held)} />
        <Stat icon={<Users size={15} />} label="Donor credits in circulation" value={credits} sub="No cash value" />
      </div>
      <section className="card table-wrap">
        <table className="table">
          <thead><tr><th>Time</th><th>Account</th><th>What happened</th><th className="r">Amount</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={`${r.owner}-${r.id}`}><td style={{ whiteSpace: 'nowrap' }}>{fmtDT(r.at)}</td><td className="strong">{r.owner}</td><td>{r.note}</td><td className="r num strong">{r.credits ? `${r.credits > 0 ? '+' : '−'}${Math.abs(r.credits)} credit` : inr(r.amount)}</td></tr>)}</tbody>
        </table>
      </section>
    </>
  );
}

const CONTROLS: { t: string; d: string; status: 'built' | 'decide' }[] = [
  { t: 'Blood is never priced', d: 'Only per-unit processing charges appear, using the government table. The system has no field for a price.', status: 'built' },
  { t: 'No paying donors', d: 'Credits have no cash value and go only to linked family. Chat warns when people mention payment.', status: 'built' },
  { t: 'Prescription before request', d: 'A request cannot be placed without an uploaded prescription or blood request form.', status: 'built' },
  { t: 'Screening lock', d: 'New units stay in quarantine and cannot be allocated until cleared.', status: 'built' },
  { t: 'Full audit trail', d: 'Every status change, discard and approval records who and when.', status: 'built' },
  { t: 'Wallet licence route', d: 'Paying other businesses from a stored balance needs an RBI-authorised issuer. Choose a partner before going live.', status: 'decide' },
  { t: 'Data protection', d: 'Consent records, retention periods and breach process under the DPDP Act need legal sign-off.', status: 'decide' },
  { t: 'Credit settlement policy', d: 'How a centre gets compensated when a credit covers a processing charge needs NBTC-aware legal review.', status: 'decide' },
];

export function AdminCompliance() {
  const { db } = useStore();
  const [tab, setTab] = useState<'controls' | 'fees' | 'audit' | 'reactions'>('controls');
  const reactions = db.orders.filter((o) => o.reaction);
  return (
    <>
      <PageHead title="Compliance & audit" sub="What the product enforces, what still needs a decision, and the record of everything that happened." />
      <div style={{ marginBottom: 14 }}><Tabs value={tab} onChange={setTab} items={[{ k: 'controls', label: 'Controls' }, { k: 'fees', label: 'Charge table' }, { k: 'audit', label: 'Audit log', n: db.audit.length }, { k: 'reactions', label: 'Reactions', n: reactions.length }]} /></div>
      {tab === 'controls' && <div className="grid g2">{CONTROLS.map((c) => (
        <article className="card pad row top" key={c.t}>
          {c.status === 'built' ? <CircleCheck size={20} color="var(--good)" /> : <AlertTriangle size={20} color="var(--warn)" />}
          <div className="grow"><div className="row between wrap"><b>{c.t}</b><Badge tone={c.status === 'built' ? 'good' : 'warn'}>{c.status === 'built' ? 'In the product' : 'Needs a decision'}</Badge></div><p className="small muted" style={{ marginTop: 3 }}>{c.d}</p></div>
        </article>
      ))}</div>}
      {tab === 'fees' && (
        <section className="card">
          <div className="card-body"><Notice tone="warn">Rates as reported from NBTC’s June 2022 guidelines. Confirm the current circular before launch.</Notice></div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Component</th><th className="r">Government centre</th><th className="r">Other centres</th></tr></thead>
            <tbody>{COMPONENT_KEYS.map((c) => <tr key={c}><td className="strong">{COMPONENTS[c].name}</td><td className="r num">{inr(FEES[c].gov)}</td><td className="r num">{inr(FEES[c].other)}</td></tr>)}</tbody>
          </table></div>
        </section>
      )}
      {tab === 'audit' && (
        <section className="card table-wrap"><table className="table">
          <thead><tr><th>Time</th><th>Who</th><th>Action</th><th>On</th></tr></thead>
          <tbody>{db.audit.map((a) => <tr key={a.id}><td style={{ whiteSpace: 'nowrap' }}>{fmtDT(a.at)}</td><td className="strong">{a.actor}</td><td>{a.action}</td><td className="num">{a.target}</td></tr>)}</tbody>
        </table></section>
      )}
      {tab === 'reactions' && (
        <section className="card">
          {reactions.map((o) => <div className="list-row" key={o.id}><AlertTriangle size={18} color="var(--crit)" /><div className="grow"><b>{o.id}</b> · {db.banks.find((b) => b.id === o.bankId)?.name}<div className="small muted">{o.reaction}</div></div></div>)}
          {!reactions.length && <Empty icon={<Scale size={26} />} title="No reactions reported" />}
        </section>
      )}
    </>
  );
}
