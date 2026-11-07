import { useEffect, useState } from 'react';
import { BadgeCheck, Loader2, Search, TriangleAlert } from 'lucide-react';
import { apiMode, directory, type DirectoryCentre } from '../api/client';

/** HQ verification: is this licence number in the government directory? */
export function LicenceCheck({ license, name }: { license: string; name: string }) {
  const [state, setState] = useState<'loading' | 'off' | 'none' | DirectoryCentre>('loading');
  useEffect(() => {
    if (!apiMode) { setState('off'); return; }
    let live = true;
    Promise.all([directory.meta(), directory.licence(license)])
      .then(([meta, r]) => { if (live) setState(meta.total === 0 ? 'off' : r.match ?? 'none'); })
      .catch(() => { if (live) setState('off'); });
    return () => { live = false; };
  }, [license]);
  if (state === 'loading') return <div className="row xs faint"><Loader2 size={13} className="spin" /> Checking the government directory…</div>;
  if (state === 'off') return <div className="xs faint">Government directory not loaded, so the licence was not cross-checked.</div>;
  if (state === 'none') return <div className="row small" style={{ color: 'var(--warn)' }}><TriangleAlert size={15} /> Licence {license} is not in the government directory. Confirm with the State FDA before approving.</div>;
  const sameName = state.name.toLowerCase().replace(/[^a-z]/g, '') === name.toLowerCase().replace(/[^a-z]/g, '');
  return (
    <div className="row top small" style={{ color: 'var(--good)' }}>
      <BadgeCheck size={16} style={{ flexShrink: 0, marginTop: 2 }} />
      <span>Licence found in the government directory: <b>{state.name}</b>, {[state.district, state.state].filter(Boolean).join(', ')}{state.renewalDate ? ` · renewal ${state.renewalDate}` : ''}.{!sameName && <span style={{ color: 'var(--warn)' }}> The name differs from the application, so check it.</span>}</span>
    </div>
  );
}

/** Franchise: search the government directory and fill an application from a real licensed centre. */
export function DirectoryPicker({ onPick }: { onPick: (c: DirectoryCentre) => void }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<DirectoryCentre[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const q = text.trim();
    if (!apiMode || q.length < 3) { setRows([]); return; }
    let live = true;
    const t = setTimeout(() => {
      setBusy(true);
      directory.search({ q, size: 6 }).then((r) => { if (live) setRows(r.rows); }).catch(() => {}).finally(() => { if (live) setBusy(false); });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [text]);
  if (!apiMode) return null;
  return (
    <div className="field">
      <label htmlFor="dir-pick">Find the centre in the government directory</label>
      <div className="search"><Search size={16} /><input id="dir-pick" className="input" placeholder="Type 3+ letters of the name, city or PIN code" value={text} onChange={(e) => setText(e.target.value)} /></div>
      {busy && <span className="xs faint">Searching…</span>}
      {rows.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          {rows.map((c) => (
            <button type="button" key={c.id} className="list-row" style={{ padding: '10px 14px' }} onClick={() => { onPick(c); setText(''); setRows([]); }}>
              <span className="grow"><b style={{ fontSize: 14 }}>{c.name}</b><span className="xs muted" style={{ display: 'block' }}>{[c.city, c.district, c.state].filter(Boolean).join(', ')}{c.license ? ` · ${c.license}` : ''}</span></span>
              <span className="link">Use</span>
            </button>
          ))}
        </div>
      )}
      <span className="help">Or type the details yourself below.</span>
    </div>
  );
}
