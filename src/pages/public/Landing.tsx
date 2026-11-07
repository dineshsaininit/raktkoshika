import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, ArrowRight, BadgeCheck, BellRing, Building2, CalendarClock, Check, FileBarChart2, HandHeart, Lock, Search, ShieldCheck, Stethoscope, Store, Thermometer, UserCircle2, Wallet, X, Droplets } from 'lucide-react';
import { COMPONENTS, COMPONENT_KEYS, GROUPS, inr } from '../../data/rules';
import type { Component } from '../../data/types';
import { useStore } from '../../store/store';
import { BagGauge, gl, Logo } from '../../ui/kit';

function LiveBoard() {
  const { db, loadPublic } = useStore();
  useEffect(() => { loadPublic(); }, [loadPublic]);
  const districts = useMemo(() => Array.from(new Set(db.banks.map((b) => b.district))), [db.banks]);
  const [district, setDistrict] = useState('Sangli');
  const [comp, setComp] = useState<Component>('PRBC');
  const ids = db.banks.filter((b) => b.district === district).map((b) => b.id);
  const counts = GROUPS.map((g) => ({ g, n: db.batches.filter((u) => ids.includes(u.bankId) && u.group === g && u.component === comp && u.status === 'available').length }));
  const max = Math.max(12, ...counts.map((c) => c.n));
  return (
    <div className="board-live">
      <div className="row between wrap">
        <div>
          <div style={{ font: '700 17px var(--display)' }}>Available right now</div>
          <div className="xs" style={{ color: '#AEB9C6' }}>{ids.length} verified centre{ids.length === 1 ? '' : 's'} · sample data</div>
        </div>
        <div className="row">
          <select className="select" aria-label="District" value={district} onChange={(e) => setDistrict(e.target.value)}>{districts.map((d) => <option key={d}>{d}</option>)}</select>
          <select className="select" aria-label="Component" value={comp} onChange={(e) => setComp(e.target.value as Component)}>{COMPONENT_KEYS.map((c) => <option key={c} value={c}>{COMPONENTS[c].short}</option>)}</select>
        </div>
      </div>
      <div className="bags">
        {counts.map(({ g, n }) => (
          <Link to={`/find?group=${encodeURIComponent(g)}&component=${comp}`} className="bag-cell" key={g} style={{ textDecoration: 'none' }} aria-label={`${g}: ${n} units`}>
            <BagGauge level={n / max} size={46} tone="dark" />
            <span className="g">{gl(g)}</span>
            <span className="u">{n ? `${n} unit${n > 1 ? 's' : ''}` : 'None here'}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

const PORTALS = [
  { role: 'user', icon: UserCircle2, title: 'Patients & donors', points: ['Order now, schedule or book units', 'Donate at any centre, earn a credit', 'Track every step of a request'] },
  { role: 'bank', icon: Droplets, title: 'Blood centres', points: ['Stock by unit with expiry alerts', 'FDA & SBTC registers in one click', 'Accounts, referrals, multiple centres'] },
  { role: 'referral', icon: Stethoscope, title: 'Hospitals & doctors', points: ['Order on behalf of a patient', 'Recurring thalassaemia plans', 'Organise camps in the hospital'] },
  { role: 'franchise', icon: Store, title: 'Franchise partners', points: ['Bring centres live in a territory', 'Sales pipeline and document checks', 'Revenue share from software plans'] },
  { role: 'admin', icon: ShieldCheck, title: 'Raktkoshika HQ', points: ['Live view of the whole network', 'Licence verification', 'Compliance and audit trail'] },
];
const STEPS = [
  { t: 'Search', d: 'See real stock by group, component and distance, without creating an account.' },
  { t: 'Request', d: 'Upload the doctor’s prescription. Your processing charge is held, not paid.' },
  { t: 'Sample', d: 'The centre verifies the prescription and receives the patient’s sample.' },
  { t: 'Cross-match', d: 'Compatible units are reserved for this patient, closest expiry first.' },
  { t: 'Issue', d: 'Units are handed over in cold chain. Only now does the charge settle.' },
];
const EXTRAS = [
  { i: AlertOctagon, t: 'Emergency mode', d: 'One tap sends a priority request to the nearest centre with stock.' },
  { i: BellRing, t: 'Shortage broadcasts', d: 'Reach opted-in donors of one group in one district, in seconds.' },
  { i: CalendarClock, t: 'Regular transfusion plans', d: 'Thalassaemia families book the next unit automatically.' },
  { i: Thermometer, t: 'Cold chain monitor', d: 'Fridge, agitator and freezer readings with out-of-range alerts.' },
  { i: FileBarChart2, t: 'One-click registers', d: 'Master, donor, issue, discard, cross-match and stock registers.' },
  { i: BadgeCheck, t: 'Rare donor flag', d: 'Rare groups are found quickly and contacted only with consent.' },
  { i: Lock, t: 'Private by default', d: 'Phone numbers stay hidden in chat unless a person chooses to share.' },
  { i: ShieldCheck, t: 'Every action logged', d: 'An audit trail for inspections, disputes and haemovigilance.' },
];

export default function Landing() {
  return (
    <div className="landing">
      <header className="nav-pub">
        <Logo size={32} sub />
        <ul><li><Link to="/centres">Blood centres</Link></li><li><a href="#how">How it works</a></li><li><a href="#wallet">Wallet</a></li><li><a href="#who">Who it serves</a></li><li><a href="#trust">Trust</a></li></ul>
        <Link to="/login" className="btn sm" style={{ background: 'rgba(255,255,255,.1)', color: '#fff', borderColor: 'rgba(255,255,255,.25)' }}>Sign in</Link>
      </header>

      <section className="hero">
        <div className="hero-grid">
          <div>
            <h1>One network.<br />One wallet.<br /><em>Every drop found.</em></h1>
            <p className="lede">Raktkoshika connects blood centres, hospitals and donors across India. See what is available right now, request it in minutes, and let every donation count at any centre in the network.</p>
            <div className="row wrap" style={{ gap: 12 }}>
              <Link to="/find" className="btn primary lg"><Search size={19} /> Find blood now</Link>
              <Link to="/login" className="btn lg">Explore the portals <ArrowRight size={18} /></Link>
            </div>
            <div className="row wrap" style={{ marginTop: 22, gap: 18, fontSize: 13.5, color: '#BEC7D2' }}>
              <span className="row" style={{ gap: 6 }}><Check size={15} color="#6FD9B4" /> Blood is never sold</span>
              <span className="row" style={{ gap: 6 }}><Check size={15} color="#6FD9B4" /> Govt-set processing charges</span>
              <span className="row" style={{ gap: 6 }}><Check size={15} color="#6FD9B4" /> Licensed centres only</span>
            </div>
          </div>
          <LiveBoard />
        </div>
      </section>

      <section className="facts">
        <div className="contain">
          <div><b>14.6 M</b><span>units of blood a year: India’s estimated need, per a national study</span></div>
          <div><b>63</b><span>of 766 districts without a functional blood centre (2025)</span></div>
          <div><b>3</b><span>components can come from a single donated unit</span></div>
          <div><b>1</b><span>wallet and donor credit valid at every centre in the network</span></div>
        </div>
      </section>

      <section className="section" id="how">
        <div className="contain">
          <span className="eyebrow">How a request moves</span>
          <h2>Five clear steps. No phone tree.</h2>
          <p className="sub">Families stop calling centre after centre. Everybody can see the same status, from the first upload to the moment units are handed over.</p>
          <div className="journey">
            {STEPS.map((s, i) => <div key={s.t}><span className="n">{i + 1}</span><h4>{s.t}</h4><p>{s.d}</p></div>)}
          </div>
        </div>
      </section>

      <section className="section dark-band" id="wallet">
        <div className="contain grid g2" style={{ gap: 'clamp(28px, 5vw, 72px)', alignItems: 'center' }}>
          <div>
            <span className="eyebrow">The wallet</span>
            <h2>Two pockets. Only one of them is money.</h2>
            <p className="sub">One pays for processing. The other records the good you have done. They never mix, which keeps the wallet useful and keeps blood out of the marketplace.</p>
            <div className="stack" style={{ marginTop: 26 }}>
              <div className="feature"><span className="ic"><Wallet size={20} /></span><div><h4>Money balance</h4><p>Pays government-set processing charges. Held at request, settled at issue, returned in full if the request does not go ahead.</p></div></div>
              <div className="feature"><span className="ic"><HandHeart size={20} /></span><div><h4>Donor credits</h4><p>Earned only by a verified donation. Usable at any centre. Can be reserved for family. Has no cash value and can never be sold or withdrawn.</p></div></div>
            </div>
          </div>
          <div className="wallet-card" style={{ background: '#202D3E' }}>
            <div className="lab">Available balance</div>
            <div className="amt">{inr(3500)}</div>
            <div className="row wrap" style={{ marginTop: 18, gap: 10 }}>
              <div className="pocket"><b>{inr(3100)}</b><span>Held for 1 request</span></div>
              <div className="pocket"><b>2 credits</b><span>From 2 donations</span></div>
            </div>
            <hr style={{ border: 0, borderTop: '1px solid rgba(255,255,255,.14)', margin: '20px 0 14px' }} />
            <div className="stack s small">
              <div className="row"><Check size={15} color="#6FD9B4" /> Use a credit toward a unit at any centre</div>
              <div className="row"><Check size={15} color="#6FD9B4" /> Reserve a credit for a parent or child</div>
              <div className="row" style={{ color: '#FFB4BE' }}><X size={15} /> Never exchanged for cash or sold to anyone</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="who">
        <div className="contain">
          <span className="eyebrow">Who it serves</span>
          <h2>A portal for each person in the chain.</h2>
          <div className="grid g3" style={{ marginTop: 36 }}>
            {PORTALS.map((p) => (
              <Link key={p.role} to={`/app/${p.role}`} className="card portal-tile">
                <span className="ic"><p.icon size={23} /></span>
                <h3>{p.title}</h3>
                <ul>{p.points.map((x) => <li key={x} className="row" style={{ gap: 7, alignItems: 'flex-start' }}><Check size={14} style={{ marginTop: 3, color: 'var(--good)' }} />{x}</li>)}</ul>
                <span className="link" style={{ marginTop: 'auto', paddingTop: 8 }}>Open portal <ArrowRight size={15} /></span>
              </Link>
            ))}
            <div className="card portal-tile" style={{ background: 'var(--brand-fill)', color: '#fff', borderColor: 'transparent', justifyContent: 'center' }}>
              <span className="ic" style={{ background: 'rgba(255,255,255,.18)', color: '#fff' }}><Building2 size={23} /></span>
              <h3>Run a blood centre?</h3>
              <p style={{ fontSize: 14, opacity: 0.92 }}>Keep your records, reach online donors and hospitals, and spend less time on registers.</p>
              <Link to="/app/bank" className="btn" style={{ marginTop: 6, background: '#fff', color: '#16202E', borderColor: '#fff' }}>See the centre portal</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="trust" style={{ background: 'var(--surface-3)' }}>
        <div className="contain">
          <span className="eyebrow">Built for a regulated field</span>
          <h2>Everything a centre and a family needs to trust it.</h2>
          <div className="grid g4" style={{ marginTop: 36, gap: 26 }}>
            {EXTRAS.map((e) => <div className="feature" key={e.t}><span className="ic"><e.i size={19} /></span><div><h4>{e.t}</h4><p>{e.d}</p></div></div>)}
          </div>
        </div>
      </section>

      <footer className="foot">
        <div className="contain row between wrap" style={{ gap: 20, alignItems: 'flex-start' }}>
          <div style={{ color: '#F3F0EA' }}><Logo size={30} sub /></div>
          <p style={{ maxWidth: '68ch' }}>Figures: national study and 2025 reporting cited by ISBT Transfusion Today and The Week. Stock, centres and people shown in this demo are sample data. Raktkoshika does not sell blood; centres charge only the processing cost set by the government.</p>
        </div>
      </footer>
    </div>
  );
}
