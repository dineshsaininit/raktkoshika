import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, KeyRound, Loader2, LogIn, Sparkles, UserPlus, X } from 'lucide-react';
import { apiMode, ApiError, hasSession, login, register } from '../../api/client';
import { DEMO_ACCOUNTS, type DemoAccount } from '../../data/demoAccounts';
import type { BloodGroup, Role } from '../../data/types';
import { ROLE_ICON, ROLE_LABEL } from '../../layouts/Shell';
import { Field, GroupPicker, Logo, useToast } from '../../ui/kit';

const SHOW_SAMPLES = String(import.meta.env.VITE_SHOW_DEMO_LOGINS ?? 'true') !== 'false';
const ROLES: Role[] = ['user', 'bank', 'referral', 'franchise', 'admin'];

const CARD: Record<Role, { blurb: string; points: string[]; hue: string }> = {
  user: { blurb: 'Order blood, donate, and use your wallet and donor credits.', points: ['Order now, schedule or book', 'Track every step live', 'Earn a credit per donation'], hue: '#E8485E' },
  bank: { blurb: 'Run requests, stock, donors, reports and accounts.', points: ['Unit-by-unit stock', 'Govt registers in one click', 'Cross-match and issue'], hue: '#F2697C' },
  referral: { blurb: 'Order for patients and plan regular transfusions.', points: ['Order for any patient', 'Thalassaemia plans', 'Hospital camps'], hue: '#3FB6A8' },
  franchise: { blurb: 'Bring centres live in your territory and track earnings.', points: ['Sales pipeline', 'Licence documents', 'Revenue share'], hue: '#E8AE52' },
  admin: { blurb: 'Watch the network, verify licences, model revenue.', points: ['Live network view', 'Licence checks', 'Audit and compliance'], hue: '#8B8CF6' },
};

/** Floating red blood cells behind the cards. Pure CSS animation; still for people who prefer reduced motion. */
function Cells() {
  const cells = useMemo(() => Array.from({ length: 16 }, (_, i) => ({
    left: `${(i * 37) % 100}%`, size: 26 + ((i * 13) % 46), delay: `${-(i * 2.3) % 18}s`, dur: `${16 + (i % 6) * 3}s`, drift: `${((i % 5) - 2) * 40}px`,
  })), []);
  return (
    <div className="cells" aria-hidden="true">
      {cells.map((c, i) => <span key={i} style={{ left: c.left, width: c.size, height: c.size, animationDelay: c.delay, animationDuration: c.dur, '--drift': c.drift } as CSSProperties} />)}
    </div>
  );
}

function PortalCard({ role, index, onOpen, signedIn }: { role: Role; index: number; onOpen: () => void; signedIn: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const I = ROLE_ICON[role];
  const c = CARD[role];
  const count = DEMO_ACCOUNTS.filter((a) => a.role === role).length;
  const tilt = (e: MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${(0.5 - y) * 10}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * 12}deg`);
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
  };
  const reset = () => { ref.current?.style.setProperty('--rx', '0deg'); ref.current?.style.setProperty('--ry', '0deg'); };
  return (
    <button ref={ref} className="pcard" style={{ '--hue': c.hue, animationDelay: `${120 + index * 110}ms` } as CSSProperties} onMouseMove={tilt} onMouseLeave={reset} onClick={onOpen} aria-label={`Sign in to the ${ROLE_LABEL[role]} portal`}>
      <span className="pcard-glow" />
      <span className="pcard-inner">
        <span className="pcard-ic"><I size={26} /></span>
        <span className="pcard-title">{ROLE_LABEL[role]}</span>
        <span className="pcard-blurb">{c.blurb}</span>
        <span className="pcard-points">{c.points.map((p) => <span key={p}><Check size={13} /> {p}</span>)}</span>
        <span className="pcard-foot">
          {signedIn ? <span className="pcard-tag on"><Check size={12} /> Signed in</span> : SHOW_SAMPLES && <span className="pcard-tag">{count} sample login{count > 1 ? 's' : ''}</span>}
          <span className="pcard-go">{signedIn ? 'Open' : 'Sign in'} <ArrowRight size={16} /></span>
        </span>
      </span>
    </button>
  );
}

function SignInPanel({ role, onClose }: { role: Role; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const I = ROLE_ICON[role];
  const samples = DEMO_ACCOUNTS.filter((a) => a.role === role);
  const [tab, setTab] = useState<'in' | 'up'>('in');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reg, setReg] = useState({ name: '', phone: '', password: '', city: '', group: 'O+' as BloodGroup, sex: 'F' as 'F' | 'M', age: '', weight: '' });
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, tab]);

  const fill = (a: DemoAccount) => { setPhone(a.phone); setPassword(a.password); setError(''); };

  const signIn = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      if (apiMode) {
        const u = await login(phone, password);
        if (u.role !== role) toast(`That number belongs to the ${ROLE_LABEL[u.role]} portal, opening it`);
        else toast(`Welcome, ${u.name.replace(/^(Dr|Sr|Mr|Ms|Mrs)\.?\s+/i, '').split(' ')[0]}`);
        navigate(`/app/${u.role}`);
      } else {
        // Browser-only demo: check against the sample sign-ins.
        const digits = phone.replace(/\D/g, '').slice(-10);
        const a = DEMO_ACCOUNTS.find((x) => x.phone === digits && x.password === password);
        if (!a) throw new Error('Wrong mobile number or password');
        navigate(`/app/${a.role}`);
      }
    } catch (err) {
      setError(err instanceof ApiError && err.status === 0 ? err.message : err instanceof Error ? err.message : 'Sign-in failed');
      setBusy(false);
    }
  };

  const signUp = async (e: FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await register({ ...reg, age: Number(reg.age), weight: Number(reg.weight) });
      toast('Account created. Welcome to Raktkoshika');
      navigate('/app/user');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account');
      setBusy(false);
    }
  };

  return (
    <div className="signin-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="signin" role="dialog" aria-modal="true" aria-label={`Sign in to the ${ROLE_LABEL[role]} portal`} style={{ '--hue': CARD[role].hue } as CSSProperties}>
        <div className="signin-head">
          <span className="pcard-ic"><I size={24} /></span>
          <div className="grow"><div className="signin-kicker">Raktkoshika</div><h2>{ROLE_LABEL[role]}</h2></div>
          <button className="btn icon sm quiet" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {role === 'user' && apiMode && (
          <div className="seg" role="tablist">
            <button role="tab" aria-selected={tab === 'in'} className={tab === 'in' ? 'on' : ''} onClick={() => { setTab('in'); setError(''); }}><LogIn size={15} /> Sign in</button>
            <button role="tab" aria-selected={tab === 'up'} className={tab === 'up' ? 'on' : ''} onClick={() => { setTab('up'); setError(''); }}><UserPlus size={15} /> Create account</button>
          </div>
        )}

        {tab === 'in' ? (
          <form className="stack" onSubmit={signIn}>
            <Field label="Mobile number">
              <input ref={first} className="input" type="tel" inputMode="numeric" autoComplete="username" placeholder="10-digit mobile number" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </Field>
            <Field label="Password">
              <div style={{ position: 'relative' }}>
                <input className="input" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ paddingRight: 46 }} />
                <button type="button" className="btn icon sm quiet" style={{ position: 'absolute', right: 4, top: 5 }} onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
            </Field>
            {error && <div className="signin-error" role="alert">{error}</div>}
            <button className="btn primary lg block" disabled={busy || !phone || !password}>{busy ? <><Loader2 size={18} className="spin" /> Signing in…</> : <>Sign in <ArrowRight size={18} /></>}</button>

            {SHOW_SAMPLES && (
              <div className="samples">
                <div className="samples-title"><KeyRound size={14} /> Sample logins for testing</div>
                {samples.map((a) => (
                  <button type="button" key={a.id} className="sample" onClick={() => fill(a)}>
                    <span className="avatar" style={{ width: 34, height: 34, fontSize: 12 }}>{a.initials}</span>
                    <span className="grow">
                      <span className="strong" style={{ display: 'block', fontSize: 13.5 }}>{a.name}{a.role !== 'user' ? ` · ${a.org}` : ''}</span>
                      <span className="xs muted" style={{ display: 'block' }}>{a.note}</span>
                      <span className="xs mono">{a.phone} · {a.password}</span>
                    </span>
                    <span className="sample-use">Use</span>
                  </button>
                ))}
                {!apiMode && <p className="xs faint">Browser-only demo: the first account of each portal is used.</p>}
              </div>
            )}
          </form>
        ) : (
          <form className="stack" onSubmit={signUp}>
            <Field label="Full name"><input ref={first} className="input" autoComplete="name" value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} required /></Field>
            <div className="grid g2" style={{ gap: 12 }}>
              <Field label="Mobile number"><input className="input" type="tel" inputMode="numeric" autoComplete="tel" value={reg.phone} onChange={(e) => setReg({ ...reg, phone: e.target.value })} required /></Field>
              <Field label="City"><input className="input" autoComplete="address-level2" value={reg.city} onChange={(e) => setReg({ ...reg, city: e.target.value })} required /></Field>
            </div>
            <Field label="Password" help="At least 8 characters"><input className="input" type="password" autoComplete="new-password" minLength={8} value={reg.password} onChange={(e) => setReg({ ...reg, password: e.target.value })} required /></Field>
            <div className="field"><span className="label">Blood group</span><GroupPicker value={reg.group} onChange={(group) => setReg({ ...reg, group })} /></div>
            <div className="grid g3" style={{ gap: 12 }}>
              <Field label="Sex"><select className="select" value={reg.sex} onChange={(e) => setReg({ ...reg, sex: e.target.value as 'F' | 'M' })}><option value="F">Female</option><option value="M">Male</option></select></Field>
              <Field label="Age"><input className="input" inputMode="numeric" value={reg.age} onChange={(e) => setReg({ ...reg, age: e.target.value.replace(/\D/g, '') })} required /></Field>
              <Field label="Weight (kg)"><input className="input" inputMode="numeric" value={reg.weight} onChange={(e) => setReg({ ...reg, weight: e.target.value.replace(/\D/g, '') })} required /></Field>
            </div>
            {error && <div className="signin-error" role="alert">{error}</div>}
            <button className="btn primary lg block" disabled={busy}>{busy ? <><Loader2 size={18} className="spin" /> Creating account…</> : <>Create account <ArrowRight size={18} /></>}</button>
            <p className="xs faint">Blood centres, hospitals and franchise partners are added by Raktkoshika after their licence is checked.</p>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Login() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const wanted = params.get('role') as Role | null;
  const [open, setOpen] = useState<Role | null>(wanted && ROLES.includes(wanted) ? wanted : null);
  const close = () => { setOpen(null); if (params.get('role')) setParams({}, { replace: true }); };
  const choose = (r: Role) => { if (apiMode && hasSession(r)) navigate(`/app/${r}`); else setOpen(r); };

  return (
    <div className="portal-page">
      <Cells />
      <header className="portal-top">
        <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}><Logo size={32} sub /></Link>
        <Link to="/" className="btn sm portal-back"><ArrowLeft size={15} /> Home</Link>
      </header>
      <main className="portal-main">
        <div className="portal-intro">
          <span className="portal-kicker"><Sparkles size={14} /> One network for every drop</span>
          <h1>Choose your <em>portal</em></h1>
          <p>Each person in the blood chain has their own workspace. Pick yours to sign in.</p>
        </div>
        <div className="pcards">
          {ROLES.map((r, i) => <PortalCard key={r} role={r} index={i} onOpen={() => choose(r)} signedIn={apiMode && hasSession(r)} />)}
        </div>
        {!apiMode && <p className="portal-note">Browser-only demo: sign-ins are checked on this device and data stays in this browser.</p>}
      </main>
      {open && <SignInPanel role={open} onClose={close} />}
    </div>
  );
}
