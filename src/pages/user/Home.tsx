import { Link } from 'react-router-dom';
import { AlertOctagon, ArrowRight, CalendarClock, CalendarHeart, Droplets, HandHeart, PackageCheck, Search, Users, Wallet } from 'lucide-react';
import { compatibleDonors, daysUntilEligible, fmtShort, GROUPS, inr, nextEligibleDate } from '../../data/rules';
import { useStore } from '../../store/store';
import { useRole } from '../../layouts/Shell';
import { BagGauge, Badge, gl, GroupTag } from '../../ui/kit';
import { isOpen, OrderRow } from '../shared/Orders';

const QUICK = [
  { to: 'order', icon: Droplets, t: 'Order blood', d: 'For today' },
  { to: 'order?mode=schedule', icon: CalendarClock, t: 'Schedule', d: 'One or many dates' },
  { to: 'order?mode=book', icon: PackageCheck, t: 'Book a bag', d: 'Before surgery' },
  { to: 'donate', icon: HandHeart, t: 'Donate', d: 'Pick any centre' },
  { to: 'camps', icon: CalendarHeart, t: 'Organise a camp', d: 'At your place' },
  { to: 'donor-requests', icon: Users, t: 'Ask for donors', d: 'When stock is short' },
];

export function UserHome() {
  const { db } = useStore();
  const { me, base } = useRole();
  const p = db.profile;
  const w = db.wallets[me];
  const active = db.orders.filter((o) => o.ownerId === me && isOpen(o));
  const wait = daysUntilEligible(p);
  const next = nextEligibleDate(p);
  const near = db.banks.filter((b) => b.km < 60).map((b) => b.id);
  const stock = GROUPS.map((g) => ({ g, n: db.batches.filter((u) => near.includes(u.bankId) && u.group === g && u.component === 'PRBC' && u.status === 'available').length }));
  const max = Math.max(12, ...stock.map((s) => s.n));
  const needYou = db.requests.filter((r) => r.status === 'open' && compatibleDonors(r.group, 'PRBC').includes(p.group) && !r.responders.includes(p.name)).slice(0, 1)[0];

  return (
    <div className="stack l">
      <header className="row between wrap">
        <div><h1 style={{ fontSize: 30 }}>Namaste, {p.name.split(' ')[0]}</h1><p className="muted">{active.length ? `You have ${active.length} request${active.length > 1 ? 's' : ''} in progress.` : 'No open requests. Everything is calm.'}</p></div>
        <Link className="btn primary show-m block" to={`${base}/order?mode=sos`}><AlertOctagon size={17} /> Emergency blood</Link>
      </header>

      <div className="grid g-main">
        <div className="stack">
          {active.length > 0 && (
            <section className="card">
              <div className="card-head"><h3>In progress</h3><Link className="link" to={`${base}/orders`}>All orders <ArrowRight size={14} /></Link></div>
              {active.slice(0, 3).map((o) => <OrderRow key={o.id} o={o} to={`${base}/orders/${o.id}`} />)}
            </section>
          )}

          <section className="grid g3" aria-label="Quick actions" style={{ gap: 12 }}>
            {QUICK.map((q) => (
              <Link key={q.t} to={`${base}/${q.to}`} className="card portal-tile" style={{ padding: 16, gap: 8 }}>
                <span className="ic" style={{ width: 38, height: 38, borderRadius: 11 }}><q.icon size={19} /></span>
                <span><b style={{ display: 'block' }}>{q.t}</b><span className="xs muted">{q.d}</span></span>
              </Link>
            ))}
          </section>

          <section className="card">
            <div className="card-head">
              <h3>Red cells within 60 km</h3>
              <Link className="link" to={`${base}/find`}><Search size={14} /> Search all</Link>
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(66px, 1fr))', gap: 8 }}>
                {stock.map(({ g, n }) => (
                  <Link key={g} to={`${base}/find?group=${encodeURIComponent(g)}`} className="center" style={{ textDecoration: 'none', color: 'inherit', padding: '8px 2px', borderRadius: 12 }}>
                    <BagGauge level={n / max} size={42} />
                    <div style={{ font: '800 16px var(--display)' }}>{gl(g)}</div>
                    <div className="xs faint">{n}</div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="stack">
          <Link to={`${base}/wallet`} className="wallet-card" style={{ textDecoration: 'none', display: 'block' }}>
            <div className="row between"><span className="lab">Wallet</span><Wallet size={17} /></div>
            <div className="amt" style={{ fontSize: 34, marginTop: 4 }}>{inr(w.balance)}</div>
            <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
              <div className="pocket"><b style={{ fontSize: 16 }}>{inr(w.held)}</b><span>Held</span></div>
              <div className="pocket"><b style={{ fontSize: 16 }}>{w.credits} credits</b><span>Any centre</span></div>
            </div>
          </Link>

          <section className="card pad stack s">
            <div className="row between"><h3 style={{ fontSize: 16 }}>Donor status</h3><GroupTag g={p.group} size="sm" /></div>
            {wait > 0
              ? <><div style={{ font: '800 26px var(--display)' }}>{wait} days to go</div><p className="small muted">You can donate again from {next ? fmtShort(next) : ''}. Your body is rebuilding its iron.</p></>
              : <><div style={{ font: '800 26px var(--display)', color: 'var(--good)' }}>Ready to donate</div><p className="small muted">One donation can help up to three patients, and earns you a credit.</p><Link className="btn sm primary" to={`${base}/donate`}>Book a slot</Link></>}
          </section>

          {needYou && (
            <section className="card pad stack s" style={{ borderColor: 'var(--brand)' }}>
              <div className="row between"><Badge tone="crit"><i className="dot live" /> Someone needs your group</Badge></div>
              <p className="small"><b>{needYou.units} × {gl(needYou.group)}</b> at {needYou.hospital}. {needYou.note}</p>
              <Link className="btn sm" to={`${base}/donor-requests`}>See the request</Link>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
