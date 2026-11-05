import { Link } from 'react-router-dom';
import { Activity, ArrowRight, CalendarHeart, ClipboardList, Droplets, HandHeart, Plus, Repeat, Wallet } from 'lucide-react';
import { COMPONENTS, fmtShort, GROUPS, inr } from '../../data/rules';
import { useStore } from '../../store/store';
import { useRole } from '../../layouts/Shell';
import { Badge, Empty, gl, GroupTag, PageHead, Stat } from '../../ui/kit';
import { isOpen, OrderRow } from '../shared/Orders';

export function ReferralHome() {
  const { db } = useStore();
  const { me, base } = useRole();
  const orders = db.orders.filter((o) => o.ownerId === me);
  const open = orders.filter(isOpen);
  const w = db.wallets[me];
  const plans = db.plans.filter((p) => p.ownerId === me && p.active);
  const near = db.banks.filter((b) => b.km < 60);
  const camps = db.camps.filter((c) => c.requestedBy === me && c.status !== 'completed');

  return (
    <>
      <PageHead title="Sanjeevani Hospital" sub="Blood for your patients, without the phone calls.">
        <Link className="btn" to={`${base}/order?mode=schedule`}><Repeat size={16} /> Schedule</Link>
        <Link className="btn primary" to={`${base}/order`}><Plus size={17} /> Order for a patient</Link>
      </PageHead>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat icon={<ClipboardList size={15} />} label="Orders in progress" value={open.length} sub={`${open.filter((o) => o.urgency === 'sos').length} emergency`} />
        <Stat icon={<Repeat size={15} />} label="Regular patients" value={plans.length} sub="On transfusion plans" />
        <Stat icon={<Wallet size={15} />} label="Wallet" value={inr(w.balance)} sub={`${inr(w.held)} held`} />
        <Stat icon={<HandHeart size={15} />} label="Donor credits" value={w.credits} sub="From donors you sent" />
      </div>
      <div className="grid g-main">
        <section className="card">
          <div className="card-head"><h3>Patients in progress</h3><Link className="link" to={`${base}/orders`}>All <ArrowRight size={14} /></Link></div>
          {open.map((o) => <OrderRow key={o.id} o={o} to={`${base}/orders/${o.id}`} />)}
          {!open.length && <Empty icon={<Activity size={26} />} title="No open orders" />}
        </section>
        <div className="stack">
          <section className="card">
            <div className="card-head"><h3>Next transfusions</h3><Link className="link" to={`${base}/plans`}>Plans</Link></div>
            {plans.map((p) => (
              <div className="list-row" key={p.id}><GroupTag g={p.group} /><div className="grow"><b>{p.patient}</b><div className="xs muted">{p.units} × {COMPONENTS[p.component].short}, every {p.everyDays} days</div></div><Badge tone="info">{fmtShort(p.next)}</Badge></div>
            ))}
            {!plans.length && <Empty title="No regular patients yet" />}
          </section>
          <section className="card">
            <div className="card-head"><h3>Red cells nearby</h3><Droplets size={16} className="faint" /></div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {GROUPS.map((g) => {
                  const n = db.batches.filter((u) => near.some((b) => b.id === u.bankId) && u.group === g && u.component === 'PRBC' && u.status === 'available').length;
                  return <Link key={g} to={`${base}/find?group=${encodeURIComponent(g)}`} className="center" style={{ textDecoration: 'none', color: 'inherit', padding: '9px 2px', borderRadius: 10, background: n < 3 ? 'var(--crit-soft)' : 'var(--surface-3)' }}><b style={{ font: '800 15px var(--display)' }}>{gl(g)}</b><div className="xs muted">{n}</div></Link>;
                })}
              </div>
            </div>
          </section>
          <section className="card pad row between">
            <div className="row"><CalendarHeart size={20} className="brand-text" /><div><b>{camps.length ? `${camps.length} camp planned` : 'Plan a hospital camp'}</b><div className="xs muted">Build your own donor base</div></div></div>
            <Link className="btn sm" to={`${base}/camps`}>Open</Link>
          </section>
        </div>
      </div>
    </>
  );
}
