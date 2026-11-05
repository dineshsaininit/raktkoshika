import { useMemo, useState } from 'react';
import { Building2, CheckCircle2, Download, FileBarChart2, HeartPulse, Plus, Printer, Stethoscope, Thermometer, TriangleAlert, Wallet } from 'lucide-react';
import { COMPONENTS, downloadCsv, fmtDate, inr } from '../../data/rules';
import type { Referral } from '../../data/types';
import { useStore } from '../../store/store';
import { useRole } from '../../layouts/Shell';
import { Badge, BarChart, Empty, Field, Modal, Notice, PageHead, Stat, Tabs, useToast } from '../../ui/kit';

/* ---------- quality ---------- */
export function BankQuality() {
  const { db } = useStore();
  const { me } = useRole();
  const sensors = db.sensors.filter((s) => s.bankId === me);
  const reactions = db.orders.filter((o) => o.bankId === me && o.reaction);
  const discarded = db.batches.filter((u) => u.bankId === me && u.status === 'discarded');
  const reasons = ['Expired', 'Screening reactive', 'Bag leak or damage', 'Cold chain failure'].map((k) => ({ k: k.split(' ')[0], v: discarded.filter((u) => u.discardReason === k).length }));
  return (
    <>
      <PageHead title="Quality & cold chain" sub="Keep every unit safe, and be ready for any inspection." />
      <section className="grid g4" style={{ marginBottom: 16 }}>
        {sensors.map((s) => {
          const ok = s.temp >= s.min && s.temp <= s.max;
          return (
            <div className="card pad stack s" key={s.id}>
              <div className="row between"><span className="small strong">{s.name}</span>{ok ? <Badge tone="good"><CheckCircle2 size={11} /> In range</Badge> : <Badge tone="crit"><TriangleAlert size={11} /> Alert</Badge>}</div>
              <div className="row" style={{ gap: 6 }}><Thermometer size={20} className="faint" /><span style={{ font: '800 30px var(--display)', fontVariantNumeric: 'tabular-nums' }}>{s.temp.toString().replace('-', '−')}°C</span></div>
              <div className="xs faint">{s.kind} · allowed {s.min}° to {s.max}°C</div>
            </div>
          );
        })}
      </section>
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <section className="card">
          <div className="card-head"><h3>Transfusion reactions reported</h3><HeartPulse size={17} className="faint" /></div>
          {reactions.map((o) => <div className="list-row" key={o.id}><div className="grow"><b>{o.id}</b> · {o.patient.name}<div className="small muted">{o.reaction}</div></div><Badge tone="crit">Investigate</Badge></div>)}
          {!reactions.length && <Empty icon={<HeartPulse size={26} />} title="No reactions reported">Families and hospitals can report from a completed order.</Empty>}
        </section>
        <section className="card">
          <div className="card-head"><h3>Discards by reason</h3><span className="xs faint">{discarded.length} units</span></div>
          <div className="card-body">{discarded.length ? <BarChart label="Discarded units by reason" data={reasons} /> : <Empty title="No discards recorded" />}</div>
        </section>
      </div>
      <div style={{ marginTop: 16 }}><Notice tone="info">Readings shown are sample values. The live product would read from fridge sensors or staff temperature logs.</Notice></div>
    </>
  );
}

/* ---------- government reports ---------- */
type ReportKey = 'master' | 'donor' | 'issue' | 'discard' | 'cross' | 'stock';
const REPORTS: { k: ReportKey; t: string; d: string }[] = [
  { k: 'master', t: 'Master register', d: 'Every unit from collection onwards' },
  { k: 'donor', t: 'Donor register', d: 'Donations and deferrals' },
  { k: 'issue', t: 'Issue register', d: 'Units issued to patients' },
  { k: 'discard', t: 'Discard register', d: 'Discards with reasons' },
  { k: 'cross', t: 'Cross-match register', d: 'Compatibility testing record' },
  { k: 'stock', t: 'Stock register', d: 'Current stock by group and component' },
];

export function BankReports() {
  const { db } = useStore();
  const { me } = useRole();
  const toast = useToast();
  const [active, setActive] = useState<ReportKey>('master');
  const orders = db.orders.filter((o) => o.bankId === me);
  const units = db.batches.filter((u) => u.bankId === me);

  const table = useMemo<(string | number)[][]>(() => {
    switch (active) {
      case 'master': return [['Unit', 'Group', 'Component', 'Collected', 'Expiry', 'Source', 'Status'], ...units.map((u) => [u.id, u.group, COMPONENTS[u.component].name, fmtDate(u.collected), fmtDate(u.expiry), u.source, u.status])];
      case 'donor': return [['Donation', 'Donor', 'Group', 'Date', 'Hb (g/dL)', 'Result'], ...db.donations.filter((d) => d.bankId === me && d.status !== 'booked' && d.status !== 'cancelled').map((d) => [d.id, d.donorName, d.group, fmtDate(d.date), d.hb ?? '-', d.status === 'completed' ? 'Donated' : `Deferred: ${d.note}`])];
      case 'issue': return [['Order', 'Patient', 'Group', 'Component', 'Units', 'Hospital', 'Issued on'], ...orders.filter((o) => ['issued', 'completed'].includes(o.stage)).map((o) => [o.id, o.patient.name, o.group, COMPONENTS[o.component].name, o.units, o.patient.hospital, fmtDate(o.events.find((e) => e.stage === 'issued')?.at ?? o.events[0].at)])];
      case 'discard': return [['Unit', 'Group', 'Component', 'Collected', 'Reason'], ...units.filter((u) => u.status === 'discarded').map((u) => [u.id, u.group, COMPONENTS[u.component].name, fmtDate(u.collected), u.discardReason ?? '-'])];
      case 'cross': return [['Order', 'Patient', 'Group', 'Component', 'Status', 'Tested on'], ...orders.filter((o) => o.events.some((e) => e.stage === 'crossmatched')).map((o) => [o.id, o.patient.name, o.group, COMPONENTS[o.component].name, 'Compatible', fmtDate(o.events.find((e) => e.stage === 'crossmatched')!.at)])];
      case 'stock': {
        const map = new Map<string, number>();
        units.filter((u) => u.status === 'available').forEach((u) => { const k = `${u.group}|${COMPONENTS[u.component].name}`; map.set(k, (map.get(k) ?? 0) + 1); });
        return [['Group', 'Component', 'Units available'], ...Array.from(map.entries()).sort().map(([k, n]) => [...k.split('|'), n])];
      }
    }
  }, [active, units, orders, db.donations, me]);
  const meta = REPORTS.find((r) => r.k === active)!;

  return (
    <>
      <PageHead title="Government reports" sub="The registers an FDA or SBTC inspection asks for, built from your daily work. Nothing to re-enter." />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 16 }}>
        {REPORTS.map((r) => (
          <button key={r.k} className={`choice ${active === r.k ? 'on' : ''}`} aria-pressed={active === r.k} onClick={() => setActive(r.k)}><FileBarChart2 size={18} className="brand-text" /><span><b style={{ fontSize: 14 }}>{r.t}</b><span className="xs muted" style={{ display: 'block' }}>{r.d}</span></span></button>
        ))}
      </div>
      <section className="card">
        <div className="card-head wrap" style={{ flexWrap: 'wrap' }}>
          <div><h3>{meta.t}</h3><div className="xs faint">Krishna Valley Blood Centre · licence MH/BB/SGL/0142 · {table.length - 1} rows</div></div>
          <div className="row">
            <button className="btn sm" onClick={() => window.print()}><Printer size={14} /> Print</button>
            <button className="btn sm primary" onClick={() => { downloadCsv(`${active}-register.csv`, table); toast(`${meta.t} downloaded`); }}><Download size={14} /> Download</button>
          </div>
        </div>
        <div className="table-wrap" style={{ maxHeight: 460, overflowY: 'auto' }}>
          <table className="table">
            <thead><tr>{table[0].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{table.slice(1, 80).map((r, i) => <tr key={i}>{r.map((c, k) => <td key={k} className={k === 0 ? 'strong num' : ''}>{c}</td>)}</tr>)}</tbody>
          </table>
          {table.length === 1 && <Empty title="No entries yet">Entries appear as your centre works.</Empty>}
        </div>
      </section>
      <div style={{ marginTop: 14 }}><Notice tone="info">Column layouts here are a working draft. Before launch, match them with the formats your State FDA and SBTC require.</Notice></div>
    </>
  );
}

/* ---------- referrals ---------- */
export function BankReferrals() {
  const { db, act } = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', kind: 'Hospital' as Referral['kind'], city: '', contact: '' });
  const list = db.referrals.filter((r) => r.bankId === 'b1');
  const total = list.reduce((s, r) => s + r.units, 0);
  return (
    <>
      <PageHead title="Referrals" sub="The hospitals, clinics and doctors you serve, with their orders in one view.">
        <button className="btn primary" onClick={() => setOpen(true)}><Plus size={17} /> Invite a referral</button>
      </PageHead>
      <div className="grid g3" style={{ marginBottom: 16 }}>
        <Stat icon={<Stethoscope size={15} />} label="Active referrals" value={list.filter((r) => r.status === 'active').length} />
        <Stat label="Units this year" value={total} />
        <Stat label="Invites pending" value={list.filter((r) => r.status === 'invited').length} />
      </div>
      <section className="card table-wrap">
        <table className="table">
          <thead><tr><th>Name</th><th>Type</th><th>City</th><th>Contact</th><th>Plan</th><th className="r">Units</th><th>Status</th></tr></thead>
          <tbody>{list.map((r) => (
            <tr key={r.id}><td className="strong">{r.name}</td><td>{r.kind}</td><td>{r.city}</td><td>{r.contact}</td><td>{r.plan}</td><td className="r num">{r.units}</td><td><Badge tone={r.status === 'active' ? 'good' : 'warn'}>{r.status === 'active' ? 'Active' : 'Invited'}</Badge></td></tr>
          ))}</tbody>
        </table>
      </section>
      <div style={{ marginTop: 14 }}><Notice tone="warn">No commissions. Paying a hospital or doctor to send patients for blood is not offered here, since it can break medical ethics rules and the principle that blood is not for sale.</Notice></div>
      {open && (
        <Modal title="Invite a referral" onClose={() => setOpen(false)}>
          <div className="stack">
            <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <div className="grid g2">
              <Field label="Type"><select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Referral['kind'] })}>{['Hospital', 'Clinic', 'Doctor', 'Nursing home'].map((k) => <option key={k}>{k}</option>)}</select></Field>
              <Field label="City"><input className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
            </div>
            <Field label="Contact person"><input className="input" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field>
            <button className="btn primary block" disabled={!f.name.trim() || !f.city.trim()} onClick={() => { act.addReferral(f.name, f.kind, f.city, f.contact || 'Not given'); setOpen(false); setF({ name: '', kind: 'Hospital', city: '', contact: '' }); toast('Invite sent'); }}>Send invite</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ---------- centres ---------- */
export function BankCentres() {
  const { db, act } = useStore();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', city: '', license: '' });
  const list = db.banks.filter((b) => b.id === 'b1' || b.parentId === 'b1');
  return (
    <>
      <PageHead title="Centres" sub="Run several centres under one login. Each keeps its own licence, stock and staff.">
        <button className="btn primary" onClick={() => setOpen(true)}><Plus size={17} /> Add a centre</button>
      </PageHead>
      <div className="grid g3">
        {list.map((b) => {
          const units = db.batches.filter((u) => u.bankId === b.id && u.status === 'available').length;
          const open_ = db.orders.filter((o) => o.bankId === b.id && !['completed', 'rejected', 'cancelled'].includes(o.stage)).length;
          return (
            <article className="card pad stack s" key={b.id}>
              <div className="row between"><Building2 size={20} className="brand-text" />{b.parentId ? <Badge>Branch</Badge> : <Badge tone="info">Head centre</Badge>}</div>
              <h3 style={{ fontSize: 17 }}>{b.name}</h3>
              <div className="small muted">{b.city} · {b.license}</div>
              <div className="row" style={{ gap: 18, marginTop: 6 }}>
                <div><div style={{ font: '800 24px var(--display)' }}>{units}</div><div className="xs faint">units</div></div>
                <div><div style={{ font: '800 24px var(--display)' }}>{open_}</div><div className="xs faint">open requests</div></div>
              </div>
            </article>
          );
        })}
      </div>
      {open && (
        <Modal title="Add a centre" sub="Raktkoshika verifies the licence before it appears to the public." onClose={() => setOpen(false)}>
          <div className="stack">
            <Field label="Centre name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="City"><input className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
            <Field label="Licence number"><input className="input" value={f.license} onChange={(e) => setF({ ...f, license: e.target.value })} /></Field>
            <button className="btn primary block" disabled={!f.name.trim() || !f.city.trim() || !f.license.trim()} onClick={() => { act.addCenter(f.name, f.city, f.license); setOpen(false); setF({ name: '', city: '', license: '' }); toast('Centre added'); }}>Add centre</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ---------- accounts ---------- */
export function BankAccounts() {
  const { db, act } = useStore();
  const toast = useToast();
  const [tab, setTab] = useState<'ledger' | 'sheet'>('ledger');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ head: '', amount: '' });
  const entries = db.accounts.filter((a) => a.bankId === 'b1');
  const income = entries.filter((e) => e.kind === 'income').reduce((s, e) => s + e.amount, 0);
  const expense = entries.filter((e) => e.kind === 'expense').reduce((s, e) => s + e.amount, 0);
  const wallet = db.wallets.b1.balance;
  const stockValue = db.batches.filter((u) => u.bankId === 'b1' && u.status === 'available').length * 620;
  const assets = [['Raktkoshika wallet balance', wallet], ['Consumables and kits in store (sample)', 88000], ['Blood stock at collection cost (sample)', stockValue], ['Equipment, net of depreciation (sample)', 1240000]] as const;
  const liabilities = [['Supplier dues (sample)', 46500], ['Staff and statutory dues (sample)', 31200]] as const;
  const totalA = assets.reduce((s, a) => s + a[1], 0);
  const totalL = liabilities.reduce((s, a) => s + a[1], 0);
  return (
    <>
      <PageHead title="Accounts" sub="Income flows in from issued orders on its own. Add your expenses to see the true picture.">
        <button className="btn" onClick={() => downloadCsv('accounts.csv', [['Date', 'Head', 'Type', 'Amount'], ...entries.map((e) => [fmtDate(e.at), e.head, e.kind, e.amount])])}><Download size={16} /> Export</button>
        <button className="btn primary" onClick={() => setOpen(true)}><Plus size={17} /> Add expense</button>
      </PageHead>
      <div className="grid g3" style={{ marginBottom: 16 }}>
        <Stat icon={<Wallet size={15} />} label="Income this month" value={inr(income)} />
        <Stat label="Expenses this month" value={inr(expense)} />
        <Stat label={income >= expense ? 'Surplus' : 'Shortfall'} value={inr(Math.abs(income - expense))} sub="Reinvested in the centre" />
      </div>
      <section className="card">
        <div style={{ padding: '4px 12px 0' }}><Tabs value={tab} onChange={setTab} items={[{ k: 'ledger', label: 'Income & expenses' }, { k: 'sheet', label: 'Balance sheet' }]} /></div>
        {tab === 'ledger' && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Head</th><th>Type</th><th className="r">Amount</th></tr></thead>
              <tbody>{entries.map((e) => <tr key={e.id}><td>{fmtDate(e.at)}</td><td>{e.head}</td><td><Badge tone={e.kind === 'income' ? 'good' : undefined}>{e.kind === 'income' ? 'Income' : 'Expense'}</Badge></td><td className="r num strong">{inr(e.amount)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        {tab === 'sheet' && (
          <div className="card-body grid g2">
            <div className="stack s">
              <h4 style={{ fontSize: 15 }}>Assets</h4>
              {assets.map(([k, v]) => <div className="row between small" key={k}><span className="muted">{k}</span><span className="num">{inr(v)}</span></div>)}
              <hr className="divider" /><div className="row between"><b>Total assets</b><b className="num">{inr(totalA)}</b></div>
            </div>
            <div className="stack s">
              <h4 style={{ fontSize: 15 }}>Liabilities & funds</h4>
              {liabilities.map(([k, v]) => <div className="row between small" key={k}><span className="muted">{k}</span><span className="num">{inr(v)}</span></div>)}
              <div className="row between small"><span className="muted">Accumulated fund</span><span className="num">{inr(totalA - totalL)}</span></div>
              <hr className="divider" /><div className="row between"><b>Total</b><b className="num">{inr(totalA)}</b></div>
            </div>
          </div>
        )}
      </section>
      {open && (
        <Modal title="Add expense" onClose={() => setOpen(false)}>
          <div className="stack">
            <Field label="What was it for?"><input className="input" value={f.head} onChange={(e) => setF({ ...f, head: e.target.value })} /></Field>
            <Field label="Amount"><input className="input" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, '') })} /></Field>
            <button className="btn primary block" disabled={!f.head.trim() || !Number(f.amount)} onClick={() => { act.addExpense(f.head, Number(f.amount)); setOpen(false); setF({ head: '', amount: '' }); toast('Expense added'); }}>Save</button>
          </div>
        </Modal>
      )}
    </>
  );
}

