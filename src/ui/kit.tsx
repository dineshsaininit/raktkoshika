import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { BloodGroup, Tone } from '../data/types';

export const gl = (g: string) => g.replace('-', '−');

export function Logo({ size = 34, word = true, sub = false }: { size?: number; word?: boolean; sub?: boolean }) {
  return (
    <span className="row" style={{ gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="30" fill="#C4283F" />
        <path d="M33 8c7 10 15 17 15 27 0 9-7 15-15 15s-15-6-15-15c0-10 8-17 15-27z" fill="#16202E" />
        <path d="M33 13c6 8 12 14 12 22 0 7-5 12-12 12s-12-5-12-12c0-8 6-14 12-22z" fill="#E8485E" />
        <path d="M29.5 26h7v6h6v7h-6v6h-7v-6h-6v-7h6z" fill="#16202E" />
        <path d="M6 42c8 5 16 13 28 13 10 0 17-6 21-15-5 5-11 7-19 7-3 0-5 1-7 2-7-1-15-6-23-7z" fill="#16202E" />
      </svg>
      {word && (
        <span style={{ lineHeight: 1 }}>
          <span style={{ font: `800 ${size * 0.56}px var(--display)`, letterSpacing: '-.025em', display: 'block' }}>Raktkoshika</span>
          {sub && <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.14em', opacity: 0.7, display: 'block', marginTop: 3 }}>DIGITAL BLOOD BANK</span>}
        </span>
      )}
    </span>
  );
}

export const GroupTag = ({ g, size, solid }: { g: BloodGroup | string; size?: 'sm' | 'lg'; solid?: boolean }) => (
  <span className={`gtag ${size ?? ''} ${solid ? 'solid' : ''}`} aria-label={`Blood group ${g}`}>{gl(g)}</span>
);

const TONE_ICON = { info: Info, good: CheckCircle2, warn: AlertTriangle, crit: AlertTriangle };
export const Notice = ({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) => {
  const I = TONE_ICON[tone];
  return <div className={`notice ${tone}`}><I size={17} /><div>{children}</div></div>;
};
export const Badge = ({ tone, children, live }: { tone?: Tone; children: ReactNode; live?: boolean }) => (
  <span className={`badge ${tone ?? ''}`}>{live && <i className="dot live" />}{children}</span>
);
export const Stat = ({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) => (
  <div className="card stat"><div className="k">{icon}{label}</div><div className="v">{value}</div>{sub && <div className="d">{sub}</div>}</div>
);
export const PageHead = ({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) => (
  <header className="page-head"><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>{children && <div className="row wrap">{children}</div>}</header>
);
export const Empty = ({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) => (
  <div className="empty">{icon}<div className="strong" style={{ color: 'var(--ink)' }}>{title}</div>{children}</div>
);
export const Field = ({ label, help, children }: { label: string; help?: string; children: ReactNode }) => (
  <div className="field"><label>{label}</label>{children}{help && <span className="help">{help}</span>}</div>
);
export const Switch = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button type="button" className="switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />
);
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { k: T; label: string; n?: number }[] }) {
  return <div className="tabs" role="tablist">{items.map((i) => (
    <button key={i.k} role="tab" aria-selected={value === i.k} className={value === i.k ? 'on' : ''} onClick={() => onChange(i.k)}>{i.label}{i.n != null ? ` · ${i.n}` : ''}</button>
  ))}</div>;
}
export const GroupPicker = ({ value, onChange }: { value: BloodGroup; onChange: (g: BloodGroup) => void }) => (
  <div className="group-pick">{(['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] as BloodGroup[]).map((g) => (
    <button key={g} type="button" className={value === g ? 'on' : ''} aria-pressed={value === g} onClick={() => onChange(g)}>{gl(g)}</button>
  ))}</div>
);

export function Modal({ title, sub, onClose, children, wide }: { title: string; sub?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div><h3>{title}</h3>{sub && <p className="muted small" style={{ marginTop: 4 }}>{sub}</p>}</div>
          <button className="btn icon sm quiet" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/* toast */
const ToastCtx = createContext<(msg: string) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);
  const push = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, msg }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">{items.map((t) => <div className="toast" key={t.id}><CheckCircle2 size={18} color="#6FD9B4" /><span>{t.msg}</span></div>)}</div>
    </ToastCtx.Provider>
  );
}

/* Signature element: a blood bag whose fill shows how much stock is on the shelf. */
export function BagGauge({ level, size = 54, tone = 'light' }: { level: number; size?: number; tone?: 'light' | 'dark' }) {
  const id = useId();
  const raw = Math.max(0, Math.min(1, level));
  const pct = raw > 0 ? Math.max(0.16, raw) : 0; // a low bag must never look like an empty one
  const top = 10 + (1 - pct) * 55;
  const stroke = tone === 'dark' ? 'rgba(255,255,255,.55)' : 'var(--line-2)';
  const fill = raw === 0 ? "transparent" : raw < 0.2 ? "#F0A23B" : "#D93750";
  return (
    <svg className="bag" width={size} height={size * 1.3} viewBox="0 0 60 78" aria-hidden="true" style={{ display: 'inline-block' }}>
      <defs><clipPath id={id}><path d="M12 12c0-3 2-5 5-5h26c3 0 5 2 5 5l2 46c0 4-3 7-7 7H17c-4 0-7-3-7-7z" /></clipPath></defs>
      <g clipPath={`url(#${id})`}>
        <g className="liq" style={{ transform: `translateY(${top}px)` }}>
          <path className="wave" fill={fill} d="M-40 3 q10 -6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 V90 H-40 z" />
        </g>
      </g>
      <path d="M12 12c0-3 2-5 5-5h26c3 0 5 2 5 5l2 46c0 4-3 7-7 7H17c-4 0-7-3-7-7z" fill="none" stroke={stroke} strokeWidth="2.2" />
      <path d="M24 7V2M36 7V2M30 65v11" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/* Charts: single axis, thin marks, hover tooltips. Series colours pass the CVD validator. */
export function BarChart({ data, height = 190, format = (v: number) => String(v), label = '' }: { data: { k: string; v: number }[]; height?: number; format?: (v: number) => string; label?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height, L = 42, B = 24, T = 10;
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.v)) * 1.08, [data]);
  const band = (W - L) / data.length;
  const barW = Math.min(30, band * 0.62);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, 0.5, 1].map((t) => Math.round(max * t));
  return (
    <div className="chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((t) => <g key={t}><line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke="var(--line)" /><text x={L - 8} y={y(t) + 4} textAnchor="end">{format(t)}</text></g>)}
        {data.map((d, i) => {
          const x = L + band * i + (band - barW) / 2;
          const yy = y(d.v);
          const h = Math.max(0, H - B - yy);
          const r = Math.min(4, h);
          return (
            <g key={d.k} onMouseEnter={() => setHover(i)}>
              <rect x={L + band * i} y={T} width={band} height={H - T - B} fill="transparent" />
              <path d={`M${x} ${H - B}V${yy + r}q0 -${r} ${r} -${r}h${barW - 2 * r}q${r} 0 ${r} ${r}V${H - B}z`} fill="var(--s1)" opacity={hover == null || hover === i ? 1 : 0.45} />
              <text x={x + barW / 2} y={H - 7} textAnchor="middle">{d.k}</text>
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="tip" style={{ left: `${((L + band * (hover + 0.5)) / W) * 100}%`, top: `${(y(data[hover].v) / H) * 100}%` }}>
          <b>{data[hover].k}</b> · {format(data[hover].v)}
        </div>
      )}
    </div>
  );
}

export function LineChart({ x, series, height = 220, label = '' }: { x: string[]; series: { name: string; color: string; values: number[] }[]; height?: number; label?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const W = 640, H = height, L = 36, R = 62, B = 24, T = 12;
  const all = series.flatMap((s) => s.values);
  const max = Math.max(...all) * 1.08, min = Math.min(...all) * 0.85;
  const px = (i: number) => L + ((W - L - R) * i) / (x.length - 1);
  const py = (v: number) => T + (H - T - B) * (1 - (v - min) / (max - min));
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(x.length - 1, Math.round(((sx - L) / (W - L - R)) * (x.length - 1)))));
  };
  return (
    <div>
      <div className="legend" style={{ marginBottom: 8 }}>{series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>
      <div className="chart" onMouseLeave={() => setHover(null)}>
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} role="img" aria-label={label}>
          {[0, 0.5, 1].map((t) => { const v = Math.round(min + (max - min) * t); return <g key={t}><line x1={L} x2={W - R} y1={py(v)} y2={py(v)} stroke="var(--line)" /><text x={L - 6} y={py(v) + 4} textAnchor="end">{v}</text></g>; })}
          {x.map((m, i) => (i % 2 === 0 || i === x.length - 1) && <text key={m} x={px(i)} y={H - 6} textAnchor="middle">{m}</text>)}
          {series.map((s) => (
            <g key={s.name}>
              <polyline fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={s.values.map((v, i) => `${px(i)},${py(v)}`).join(' ')} />
            </g>
          ))}
          {series.map((s, si) => {
            const last = s.values[s.values.length - 1];
            const other = series[1 - si]?.values[s.values.length - 1] ?? last;
            const nudge = Math.abs(py(last) - py(other)) < 14 ? (last >= other ? -7 : 7) : 0;
            return <text key={s.name} x={W - R + 7} y={py(last) + 4 + nudge} style={{ fill: 'var(--ink-2)' }}>{s.name}</text>;
          })}
          {hover != null && <line x1={px(hover)} x2={px(hover)} y1={T} y2={H - B} stroke="var(--line-2)" />}
          {hover != null && series.map((s) => <circle key={s.name} cx={px(hover)} cy={py(s.values[hover])} r="4.5" fill={s.color} stroke="var(--surface)" strokeWidth="2" />)}
        </svg>
        {hover != null && (
          <div className="tip" style={{ left: `${(px(hover) / W) * 100}%`, top: 4, transform: 'translate(-50%, 0)' }}>
            <b>{x[hover]}</b> · {series.map((s) => `${s.name} ${s.values[hover]}`).join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
}
