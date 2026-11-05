import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { inr } from '../../data/rules';
import { BarChart, Notice, PageHead, Tabs } from '../../ui/kit';

const DEFAULTS = {
  banks: 100, referrals: 100,
  m1: 500, m2: 500, m3: 500, master: 2000, masterShare: 25,
  patients: 10, charge: 500, pct: 2, slabBase: 25000, slabPct: 1,
  perDay: 50, regs: 10, perReg: 5, f1: 2, f2: 3, f3: 5,
  refM: 500, refQ: 2500, refY: 5000,
};
type K = keyof typeof DEFAULTS;
const compact = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : inr(n));

function Input({ v, k, set, label, prefix, suffix }: { v: typeof DEFAULTS; k: K; set: (k: K, n: number) => void; label: string; prefix?: string; suffix?: string }) {
  return (
    <div className="field">
      <label htmlFor={k}>{label}</label>
      <div style={{ position: 'relative' }}>
        {prefix && <span style={{ position: 'absolute', left: 12, top: 11, color: 'var(--brand-ink)', fontWeight: 600 }}>{prefix}</span>}
        <input id={k} className="input num" inputMode="numeric" style={{ paddingLeft: prefix ? 26 : undefined, color: 'var(--brand-ink)', fontWeight: 600 }} value={v[k]} onChange={(e) => set(k, Number(e.target.value.replace(/\D/g, '')))} />
        {suffix && <span className="xs faint" style={{ position: 'absolute', right: 12, top: 14 }}>{suffix}</span>}
      </div>
    </div>
  );
}

const Row = ({ k, m, y, strong }: { k: string; m: number; y: number; strong?: boolean }) => (
  <tr style={strong ? { background: 'var(--brand-soft)' } : undefined}>
    <td className={strong ? 'strong' : ''}>{k}</td><td className={`r num ${strong ? 'strong' : ''}`}>{inr(m)}</td><td className={`r num ${strong ? 'strong' : ''}`}>{inr(y)}</td>
  </tr>
);
const Table = ({ children }: { children: React.ReactNode }) => (
  <div className="table-wrap"><table className="table"><thead><tr><th>Line</th><th className="r">Monthly</th><th className="r">Yearly</th></tr></thead><tbody>{children}</tbody></table></div>
);

export function RevenueModels() {
  const [v, setV] = useState(DEFAULTS);
  const [tab, setTab] = useState<'fixed' | 'business' | 'txn' | 'ref'>('fixed');
  const set = (k: K, n: number) => setV((s) => ({ ...s, [k]: n }));
  const D = 30;

  // 1. Fixed
  const avgPlan = (v.m1 + v.m2 + v.m3) / 3;
  const fixedM = v.banks * ((1 - v.masterShare / 100) * avgPlan + (v.masterShare / 100) * v.master);
  // 2. Business
  const dailyBilling = v.patients * v.charge;
  const bizM = v.banks * dailyBilling * D * (v.pct / 100);
  const slabs = [1, 2, 3, 4, 5].map((i) => ({ upto: v.slabBase * i, pct: v.slabPct * i, m: v.banks * v.slabBase * i * D * (v.slabPct * i / 100) }));
  const applied = slabs.find((s) => dailyBilling <= s.upto) ?? slabs[4];
  const slabM = v.banks * dailyBilling * D * (applied.pct / 100);
  // 3. Transaction
  const txnRows = [
    { k: 'Per-day charge', m: v.banks * v.perDay * D },
    { k: 'Fixed per registration', m: v.banks * v.regs * v.perReg * D },
    { k: 'Facility plan 1', m: v.banks * v.regs * v.f1 * D },
    { k: 'Facility plan 2', m: v.banks * v.regs * v.f2 * D },
    { k: 'Facility plan 3', m: v.banks * v.regs * v.f3 * D },
  ];
  const txnAvg = txnRows.reduce((s, r) => s + r.m, 0) / txnRows.length;
  // 4. Referral
  const refRows = [{ k: 'Monthly billing', y: v.referrals * v.refM * 12 }, { k: 'Quarterly billing', y: v.referrals * v.refQ * 4 }, { k: 'Yearly billing', y: v.referrals * v.refY }];
  const refAvgY = refRows.reduce((s, r) => s + r.y, 0) / 3;
  const quarterlyInverted = v.refQ / 3 > v.refM;

  const summary = [{ k: 'Fixed', v: fixedM * 12 }, { k: 'Business %', v: bizM * 12 }, { k: 'Transaction', v: txnAvg * 12 }, { k: 'Referral', v: refAvgY }];

  return (
    <>
      <PageHead title="Revenue models" sub="The four models from the proposal, live. Change any value in red and every total updates.">
        <button className="btn" onClick={() => setV(DEFAULTS)}><RotateCcw size={16} /> Restore proposal values</button>
      </PageHead>
      <div className="grid g-main" style={{ marginBottom: 16 }}>
        <section className="card">
          <div className="card-head"><h3>Yearly revenue by model</h3><span className="xs faint">{v.banks} centres, {v.referrals} referrals</span></div>
          <div className="card-body"><BarChart label="Yearly revenue by model" data={summary} format={compact} height={210} /></div>
        </section>
        <section className="card pad stack">
          <h3 style={{ fontSize: 16 }}>Scale</h3>
          <div className="grid g2">
            <Input v={v} k="banks" set={set} label="Blood centres" />
            <Input v={v} k="referrals" set={set} label="Referrals" />
          </div>
          <Notice tone="warn"><b>These are projections, not forecasts.</b> They assume every centre is live and paying from day one, with no churn or costs.</Notice>
        </section>
      </div>

      <section className="card">
        <div style={{ padding: '4px 12px 0' }}><Tabs value={tab} onChange={setTab} items={[{ k: 'fixed', label: '1. Fixed' }, { k: 'business', label: '2. Business based' }, { k: 'txn', label: '3. Transaction wise' }, { k: 'ref', label: '4. Referral' }]} /></div>
        <div className="card-body stack">
          {tab === 'fixed' && (
            <>
              <div className="grid g4">
                <Input v={v} k="m1" set={set} label="Model 1 / month" prefix="₹" />
                <Input v={v} k="m2" set={set} label="Model 2 / month" prefix="₹" />
                <Input v={v} k="m3" set={set} label="Model 3 / month" prefix="₹" />
                <Input v={v} k="master" set={set} label="Master / month" prefix="₹" />
                <Input v={v} k="masterShare" set={set} label="Centres on Master" suffix="%" />
              </div>
              <Table>
                <Row k="Every centre on Model 1" m={v.banks * v.m1} y={v.banks * v.m1 * 12} />
                <Row k="Every centre on Master" m={v.banks * v.master} y={v.banks * v.master * 12} />
                <Row k={`Blended: ${v.masterShare}% on Master, the rest on Models 1 to 3`} m={fixedM} y={fixedM * 12} strong />
              </Table>
              <Notice tone="info"><b>Changed from the proposal.</b> The deck shows ₹80,000 a month because its average also counted the “Average” row. With its own values, a blend across the four plans comes to ₹87,500.</Notice>
            </>
          )}
          {tab === 'business' && (
            <>
              <div className="grid g3">
                <Input v={v} k="patients" set={set} label="Patients per day, per centre" />
                <Input v={v} k="charge" set={set} label="Average charge" prefix="₹" />
                <Input v={v} k="pct" set={set} label="Fixed share" suffix="%" />
                <Input v={v} k="slabBase" set={set} label="Slab size (daily billing)" prefix="₹" />
                <Input v={v} k="slabPct" set={set} label="Share per slab" suffix="%" />
              </div>
              <Table>
                <Row k={`Fixed ${v.pct}% of ${inr(dailyBilling)} daily billing`} m={bizM} y={bizM * 12} strong />
                <Row k={`Slab model at this billing: ${applied.pct}% (up to ${inr(applied.upto)} a day)`} m={slabM} y={slabM * 12} strong />
              </Table>
              <details>
                <summary className="strong small" style={{ cursor: 'pointer' }}>If every centre billed at the top of each slab</summary>
                <Table>{slabs.map((s) => <Row key={s.pct} k={`${inr(s.upto)} a day at ${s.pct}%`} m={s.m} y={s.m * 12} />)}</Table>
              </details>
              <Notice tone="info"><b>Changed from the proposal.</b> The deck reports ₹69.25 lakh a month as its “average”, from a slab table assuming ₹25,000 to ₹1,25,000 daily billing, while its own inputs give ₹5,000 a day. It also averages the fixed model in with the slabs. At the deck’s own inputs, the slab model gives ₹1.5 lakh a month.</Notice>
              <Notice tone="crit"><b>Legal risk.</b> A cut of a centre’s processing charges may breach the rule that only processing cost can be charged for blood. Get legal advice before offering this model.</Notice>
            </>
          )}
          {tab === 'txn' && (
            <>
              <div className="grid g3">
                <Input v={v} k="perDay" set={set} label="Per-day charge" prefix="₹" />
                <Input v={v} k="regs" set={set} label="Registrations per day" />
                <Input v={v} k="perReg" set={set} label="Fixed per registration" prefix="₹" />
                <Input v={v} k="f1" set={set} label="Plan 1 per registration" prefix="₹" />
                <Input v={v} k="f2" set={set} label="Plan 2 per registration" prefix="₹" />
                <Input v={v} k="f3" set={set} label="Plan 3 per registration" prefix="₹" />
              </div>
              <Table>
                {txnRows.map((r) => <Row key={r.k} k={r.k} m={r.m} y={r.m * 12} />)}
                <Row k="Average of the five options" m={txnAvg} y={txnAvg * 12} strong />
              </Table>
              <Notice tone="good">These figures match the proposal: ₹1,20,000 a month at its values.</Notice>
            </>
          )}
          {tab === 'ref' && (
            <>
              <div className="grid g3">
                <Input v={v} k="refM" set={set} label="Monthly billing" prefix="₹" />
                <Input v={v} k="refQ" set={set} label="Quarterly billing" prefix="₹" />
                <Input v={v} k="refY" set={set} label="Yearly billing" prefix="₹" />
              </div>
              <Table>
                {refRows.map((r) => <Row key={r.k} k={r.k} m={r.y / 12} y={r.y} />)}
                <Row k="Average of the three cycles" m={refAvgY / 12} y={refAvgY} strong />
              </Table>
              {quarterlyInverted && <Notice tone="warn"><b>Quarterly costs more than monthly.</b> {inr(v.refQ)} a quarter is {inr(v.refQ / 3)} a month, against {inr(v.refM)} on monthly billing, so nobody would choose it. A price near {inr(Math.round(v.refM * 3 * 0.9))} would give a 10% discount.</Notice>}
              <Notice tone="info"><b>Changed from the proposal.</b> The deck shows quarterly as ₹5,00,000 a year. Four quarters of ₹2,500 across 100 referrals is ₹10,00,000.</Notice>
            </>
          )}
        </div>
      </section>
    </>
  );
}
