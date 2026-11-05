import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, AlertOctagon, Banknote, Bell, BarChart3, Building2, CalendarHeart, ChevronsUpDown, ClipboardCheck, ClipboardList, Droplets,
  FileBarChart2, HandHeart, HeartPulse, Home, Landmark, LifeBuoy, Menu, MessagesSquare, Moon, Network, Package, ReceiptIndianRupee, Repeat, Scale, Search, ShieldCheck, Sun, Syringe, Target, UserCircle2, Users, Wallet, History, Stethoscope, Store, type LucideIcon,
} from 'lucide-react';
import type { Role } from '../data/types';
import { ago } from '../data/rules';
import { ME, PERSONA } from '../data/seed';
import { useStore } from '../store/store';
import { Logo, Notice, useToast } from '../ui/kit';

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean; count?: number; tab?: boolean }
interface NavGroup { label?: string; items: NavItem[] }

const ROLE_LABEL: Record<Role, string> = { user: 'Patient & donor', bank: 'Blood centre', referral: 'Hospital / doctor', franchise: 'Franchise', admin: 'Raktkoshika admin' };
const ROLE_ICON: Record<Role, LucideIcon> = { user: UserCircle2, bank: Droplets, referral: Stethoscope, franchise: Store, admin: ShieldCheck };

const RoleCtx = createContext<{ role: Role; me: string; base: string; persona: (typeof PERSONA)[Role] }>({ role: 'user', me: 'u1', base: '/app/user', persona: PERSONA.user });
export const useRole = () => useContext(RoleCtx);

function useNav(role: Role): NavGroup[] {
  const { db } = useStore();
  const queue = db.orders.filter((o) => o.bankId === ME.bank && !['completed', 'rejected', 'cancelled'].includes(o.stage)).length;
  const pendingApps = db.applications.filter((a) => a.status === 'pending').length;
  const openTickets = db.tickets.filter((t) => t.status === 'open').length;
  switch (role) {
    case 'user': return [
      { items: [{ to: '', label: 'Home', icon: Home, end: true, tab: true }, { to: 'find', label: 'Find blood', icon: Search, tab: true }, { to: 'orders', label: 'My orders', icon: ClipboardList, tab: true }] },
      { label: 'Give', items: [{ to: 'donate', label: 'Donate blood', icon: HandHeart }, { to: 'donor-requests', label: 'Donor requests', icon: Users }, { to: 'camps', label: 'Blood camps', icon: CalendarHeart }] },
      { label: 'Account', items: [{ to: 'plans', label: 'Regular transfusions', icon: Repeat }, { to: 'wallet', label: 'Wallet', icon: Wallet, tab: true }, { to: 'chat', label: 'Chat', icon: MessagesSquare }, { to: 'history', label: 'History', icon: History }, { to: 'profile', label: 'Profile', icon: UserCircle2 }] },
    ];
    case 'referral': return [
      { items: [{ to: '', label: 'Overview', icon: Home, end: true, tab: true }, { to: 'find', label: 'Find blood', icon: Search, tab: true }, { to: 'orders', label: 'Patient orders', icon: ClipboardList, tab: true }, { to: 'plans', label: 'Regular transfusions', icon: Repeat }] },
      { label: 'Donors', items: [{ to: 'donor-requests', label: 'Donor requests', icon: Users }, { to: 'camps', label: 'Hospital camps', icon: CalendarHeart }] },
      { label: 'Account', items: [{ to: 'wallet', label: 'Hospital wallet', icon: Wallet, tab: true }, { to: 'chat', label: 'Chat', icon: MessagesSquare }, { to: 'history', label: 'History', icon: History }] },
    ];
    case 'bank': return [
      { items: [{ to: '', label: 'Today', icon: Home, end: true, tab: true }, { to: 'requests', label: 'Requests', icon: ClipboardCheck, count: queue, tab: true }, { to: 'stock', label: 'Blood stock', icon: Package, tab: true }, { to: 'donors', label: 'Donors', icon: Syringe }, { to: 'camps', label: 'Camps', icon: CalendarHeart }] },
      { label: 'Run the centre', items: [{ to: 'quality', label: 'Quality & cold chain', icon: HeartPulse }, { to: 'reports', label: 'Govt reports', icon: FileBarChart2 }, { to: 'referrals', label: 'Referrals', icon: Stethoscope }, { to: 'centres', label: 'Centres', icon: Building2 }] },
      { label: 'Money', items: [{ to: 'accounts', label: 'Accounts', icon: Landmark }, { to: 'wallet', label: 'Wallet', icon: Wallet, tab: true }, { to: 'chat', label: 'Chat', icon: MessagesSquare }] },
    ];
    case 'franchise': return [
      { items: [{ to: '', label: 'Overview', icon: Home, end: true, tab: true }, { to: 'pipeline', label: 'Sales pipeline', icon: Target, tab: true }, { to: 'centres', label: 'Centres & onboarding', icon: Building2, tab: true }, { to: 'earnings', label: 'Earnings', icon: Banknote, tab: true }, { to: 'support', label: 'Support', icon: LifeBuoy, count: openTickets }, { to: 'chat', label: 'Chat', icon: MessagesSquare }] },
    ];
    case 'admin': return [
      { items: [{ to: '', label: 'Command centre', icon: Activity, end: true, tab: true }, { to: 'network', label: 'Network stock', icon: Network, tab: true }, { to: 'verification', label: 'Verification', icon: ShieldCheck, count: pendingApps, tab: true }] },
      { label: 'Business', items: [{ to: 'transactions', label: 'Wallet ledger', icon: ReceiptIndianRupee }, { to: 'revenue', label: 'Revenue models', icon: BarChart3, tab: true }] },
      { label: 'Governance', items: [{ to: 'compliance', label: 'Compliance & audit', icon: Scale }, { to: 'support', label: 'Support', icon: LifeBuoy, count: openTickets }, { to: 'chat', label: 'Chat', icon: MessagesSquare }] },
    ];
  }
}

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { const t = localStorage.getItem('rk-theme'); if (t === 'dark' || t === 'light') return t; } catch { /* default below */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('rk-theme', theme); } catch { /* per-visit only */ }
  }, [theme]);
  return [theme, setTheme] as const;
}

function Palette({ role, base, nav, onClose }: { role: Role; base: string; nav: NavGroup[]; onClose: () => void }) {
  const { db } = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const s = q.toLowerCase().trim();
    const pages = nav.flatMap((g) => g.items).map((i) => ({ key: `p${i.to}`, title: i.label, sub: 'Page', to: i.to ? `${base}/${i.to}` : base }));
    const canSeeOrders = role === 'admin' || role === 'bank' || role === 'user' || role === 'referral';
    const orders = canSeeOrders ? db.orders
      .filter((o) => role === 'admin' || (role === 'bank' ? o.bankId === ME.bank : o.ownerId === ME[role]))
      .map((o) => ({ key: o.id, title: `${o.id} · ${o.patient.name}`, sub: `Order · ${o.units} × ${o.group}`, to: role === 'bank' ? `${base}/requests` : role === 'admin' ? `${base}/compliance` : `${base}/orders/${o.id}` })) : [];
    return [...pages, ...orders].filter((r) => !s || `${r.title} ${r.sub}`.toLowerCase().includes(s)).slice(0, 8);
  }, [q, db.orders, nav, base, role]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div className="modal palette" role="dialog" aria-label="Search">
        <div style={{ position: 'relative', borderBottom: '1px solid var(--line)' }}>
          <Search size={18} style={{ position: 'absolute', left: 20, top: 20, color: 'var(--ink-3)' }} />
          <input autoFocus placeholder="Search pages and orders" aria-label="Search pages and orders" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { navigate(results[0].to); onClose(); } }} />
        </div>
        <div className="pop-scroll">
          {results.map((r) => <button key={r.key} className="list-row" onClick={() => { navigate(r.to); onClose(); }}><div className="grow"><div className="strong">{r.title}</div><div className="xs faint">{r.sub}</div></div></button>)}
          {!results.length && <div className="empty">Nothing matches that search.</div>}
        </div>
      </div>
    </div>
  );
}

export function Shell({ role }: { role: Role }) {
  const { db, act, sync, connect } = useStore();
  const nav = useNav(role);
  const base = `/app/${role}`;
  const me = db.me?.role === role ? db.me.id : ME[role];
  const persona = PERSONA[role];
  const [theme, setTheme] = useTheme();
  const [open, setOpen] = useState(false);
  const [bell, setBell] = useState(false);
  const [roles, setRoles] = useState(false);
  const [palette, setPalette] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  const toast = useToast();

  // With VITE_API_URL set, sign this portal in and load its data from the server.
  useEffect(() => { connect(role); }, [connect, role]);
  useEffect(() => { setOpen(false); setBell(false); setRoles(false); window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const notices = db.notices.filter((n) => n.to === role || n.to === 'all');
  const unread = notices.filter((n) => !n.read).length;
  const tabs = nav.flatMap((g) => g.items).filter((i) => i.tab).slice(0, 4);
  const canOrder = role === 'user' || role === 'referral';
  const ctx = useMemo(() => ({ role, me, base, persona }), [role, me, base, persona]);
  const toneColor = { info: 'var(--info)', good: 'var(--good)', warn: 'var(--warn)', crit: 'var(--crit)' };

  return (
    <RoleCtx.Provider value={ctx}>
      <div className="shell">
        {open && <div className="scrim" onClick={() => setOpen(false)} />}
        <aside className={`side ${open ? 'open' : ''}`}>
          <Link to="/" className="side-brand"><Logo size={30} sub /></Link>
          {canOrder && (
            <div className="side-sos">
              <Link to={`${base}/order?mode=sos`} className="btn primary block"><AlertOctagon size={17} /> Emergency blood</Link>
            </div>
          )}
          <nav aria-label="Main">
            {nav.map((g, i) => (
              <div key={i}>
                {g.label && <div className="nav-label">{g.label}</div>}
                {g.items.map((it) => (
                  <NavLink key={it.to} to={it.to ? `${base}/${it.to}` : base} end={it.end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <it.icon size={18} /><span>{it.label}</span>{!!it.count && <span className="count">{it.count}</span>}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div style={{ position: 'relative' }}>
            {roles && (
              <div className="popover" style={{ top: 'auto', bottom: 'calc(100% + 8px)', left: 0, right: 'auto', width: 262, color: 'var(--ink)' }}>
                <div className="xs faint" style={{ padding: '12px 16px 6px' }}>Switch portal</div>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => {
                  const I = ROLE_ICON[r];
                  return <button key={r} className="list-row" style={{ padding: '10px 16px' }} onClick={() => { setRoles(false); navigate(`/app/${r}`); }}><I size={18} /><span className={r === role ? 'strong' : ''}>{ROLE_LABEL[r]}</span></button>;
                })}
              </div>
            )}
            <button className="persona" onClick={() => setRoles(!roles)} aria-expanded={roles} aria-label="Switch portal">
              <span className="avatar">{persona.initials}</span>
              <span className="grow"><span className="strong truncate" style={{ display: 'block', fontSize: 13.5 }}>{persona.name}</span><span className="truncate" style={{ display: 'block', fontSize: 12, color: 'var(--on-navy-2)' }}>{persona.org}</span></span>
              <ChevronsUpDown size={16} color="var(--on-navy-2)" />
            </button>
          </div>
        </aside>

        <div className="main">
      <div className="demo-bar">
        <span>Demo with sample data. Nothing here is a real patient, payment or stock record.</span>
        <button onClick={() => { act.reset(); toast('Demo data restored'); }}>Reset demo</button>
      </div>
          <div className="topbar">
            <button className="btn icon quiet show-m" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={21} /></button>
            <span className="show-m"><Logo size={26} word={false} /></span>
            <button className="searchbtn" onClick={() => setPalette(true)}><Search size={16} /> <span className="truncate">Search</span> <kbd>Ctrl K</kbd></button>
            <div className="row" style={{ marginLeft: 'auto', gap: 4 }}>
              <span className="hide-m" style={{ marginRight: 8 }}><span className="badge good"><i className="dot live" />Network live</span></span>
              <button className="btn icon quiet" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button>
              <div style={{ position: 'relative' }}>
                <button className="btn icon quiet" style={{ position: 'relative' }} aria-label={`${unread} unread notifications`} aria-expanded={bell} onClick={() => { setBell(!bell); }}>
                  <Bell size={19} />{unread > 0 && <span className="bell-count">{unread}</span>}
                </button>
                {bell && (
                  <div className="popover">
                    <div className="row between" style={{ padding: '13px 16px', borderBottom: '1px solid var(--line)' }}>
                      <b>Notifications</b>
                      <button className="link" onClick={() => act.readNotices(role)}>Mark all read</button>
                    </div>
                    <div className="pop-scroll">
                      {notices.slice(0, 12).map((n) => (
                        <Link key={n.id} className="list-row" style={{ padding: '12px 16px', alignItems: 'flex-start' }} to={n.link ? `${base}/${n.link}` : base}>
                          <i className="dot" style={{ color: toneColor[n.tone], marginTop: 7, opacity: n.read ? 0.3 : 1 }} />
                          <div className="grow"><div className={n.read ? '' : 'strong'} style={{ fontSize: 14 }}>{n.title}</div><div className="xs muted">{n.body}</div><div className="xs faint" style={{ marginTop: 2 }}>{ago(n.at)}</div></div>
                        </Link>
                      ))}
                      {!notices.length && <div className="empty">You are all caught up.</div>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <main className="page" key={loc.pathname}>
            {sync.mode === 'api' && sync.status === 'connecting' && <Notice tone="info">Connecting to the server…</Notice>}
            {sync.mode === 'api' && sync.status === 'error' && <Notice tone="crit">Server: {sync.error}. The screen shows the server's latest data.</Notice>}
            <Outlet />
          </main>
        </div>

        <nav className="tabbar" aria-label="Quick">
          {tabs.map((t) => <NavLink key={t.to} to={t.to ? `${base}/${t.to}` : base} end={t.end}><t.icon size={21} />{t.label.split(' ').slice(0, 2).join(' ')}</NavLink>)}
          <button onClick={() => setOpen(true)}><Menu size={21} />More</button>
        </nav>
      </div>
      {palette && <Palette role={role} base={base} nav={nav} onClose={() => setPalette(false)} />}
    </RoleCtx.Provider>
  );
}

export { ROLE_LABEL, ROLE_ICON };
