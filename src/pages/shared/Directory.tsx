import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Building2, Clock, ExternalLink, Mail, MapPin, Navigation, Phone, Search } from 'lucide-react';
import { apiMode, directory, ERAKTKOSH_URL, mapsUrl, type DirectoryCentre, type DirectoryMeta } from '../../api/client';
import { fmtDate } from '../../data/rules';
import { Badge, Empty, Notice, PageHead } from '../../ui/kit';
import { useRole } from '../../layouts/Shell';

const tel = (n: string) => n.split(/[,/;]| or /i)[0].replace(/[^\d+]/g, '');
const SIZE = 20;

function CentreCard({ c, findBase }: { c: DirectoryCentre; findBase?: string }) {
  const phones = [c.phone, c.mobile].filter(Boolean);
  return (
    <article className="card pad stack s">
      <div className="row between top">
        <div className="grow">
          <h3 style={{ fontSize: 16.5 }}>{c.name}</h3>
          <div className="small muted row" style={{ gap: 5, marginTop: 3, alignItems: 'flex-start' }}>
            <MapPin size={13} style={{ marginTop: 3, flexShrink: 0 }} />
            <span>{[c.address, c.city !== c.district ? c.city : '', c.district, c.state, c.pincode].filter(Boolean).join(', ')}</span>
          </div>
        </div>
        {c.category && <Badge>{c.category}</Badge>}
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        {c.onNetwork && <Badge tone="good"><BadgeCheck size={11} /> On Raktkoshika, live stock</Badge>}
        {c.components === true && <Badge tone="info">Blood components</Badge>}
        {c.apheresis === true && <Badge tone="info">Apheresis</Badge>}
        {c.serviceTime && <Badge><Clock size={11} /> {c.serviceTime}</Badge>}
      </div>
      {(c.license || c.renewalDate) && <div className="xs faint">{c.license && <>Licence {c.license}</>}{c.renewalDate && <> · valid/renewed {c.renewalDate}</>}</div>}
      <hr className="divider" />
      <div className="row wrap" style={{ gap: 6 }}>
        {phones.map((p) => <a key={p} className="btn sm" href={`tel:${tel(p)}`}><Phone size={14} /> {p}</a>)}
        {c.email && <a className="btn sm icon" href={`mailto:${c.email}`} aria-label={`Email ${c.name}`}><Mail size={14} /></a>}
        <a className="btn sm" href={mapsUrl(c)} target="_blank" rel="noreferrer"><Navigation size={14} /> Directions</a>
        {c.onNetwork && findBase
          ? <Link className="btn sm primary" to={findBase}>See stock</Link>
          : <a className="btn sm" href={ERAKTKOSH_URL} target="_blank" rel="noreferrer">Stock on e-RaktKosh <ExternalLink size={13} /></a>}
      </div>
    </article>
  );
}

/**
 * Directory of licensed blood centres from government data, laid out like e-RaktKosh's blood bank directory:
 * state, then district, then name. The directory has no stock; centres on Raktkoshika link to live stock.
 */
export function DirectoryBrowser({ findBase }: { findBase?: string }) {
  const [meta, setMeta] = useState<DirectoryMeta | null>(null);
  const [states, setStates] = useState<{ state: string; count: number }[]>([]);
  const [districts, setDistricts] = useState<{ district: string; count: number }[]>([]);
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [components, setComponents] = useState(false);
  const [page, setPage] = useState(1);
  const [res, setRes] = useState<{ total: number; rows: DirectoryCentre[] } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!apiMode) return;
    directory.meta().then(setMeta).catch((e) => setError(e.message));
    directory.states().then((s) => {
      setStates(s);
      // Start where the network is: Maharashtra when present.
      const mh = s.find((x) => x.state.toLowerCase() === 'maharashtra');
      if (mh) setState(mh.state);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    setDistrict(''); setDistricts([]);
    if (state) directory.districts(state).then(setDistricts).catch(() => {});
  }, [state]);
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 300); return () => clearTimeout(t); }, [text]);
  useEffect(() => { setPage(1); }, [state, district, q, components]);
  useEffect(() => {
    if (!apiMode) return;
    let live = true;
    setLoading(true);
    directory.search({ state, district, q, components, page, size: SIZE })
      .then((r) => { if (live) { setRes(r); setError(''); } })
      .catch((e) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [state, district, q, components, page]);

  if (!apiMode) {
    return <Notice tone="info">The government directory needs the Raktkoshika server. Meanwhile you can search every licensed centre on <a href={ERAKTKOSH_URL} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>e-RaktKosh</a>.</Notice>;
  }
  if (meta && meta.total === 0) {
    return (
      <div className="card"><Empty icon={<Building2 size={28} />} title="The government directory has not been loaded yet">
        <span className="small" style={{ maxWidth: 460 }}>Raktkoshika HQ loads the official list of licensed blood centres. Until then, search all licensed centres and their stock on e-RaktKosh.</span>
        <a className="btn sm" href={ERAKTKOSH_URL} target="_blank" rel="noreferrer">Open e-RaktKosh <ExternalLink size={13} /></a>
      </Empty></div>
    );
  }
  const pages = res ? Math.max(1, Math.ceil(res.total / SIZE)) : 1;

  return (
    <div className="stack">
      <div className="card pad">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'end' }}>
          <div className="field"><label htmlFor="dir-state">State</label>
            <select id="dir-state" className="select" value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">All states</option>
              {states.map((s) => <option key={s.state} value={s.state}>{s.state} ({s.count})</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="dir-district">District</label>
            <select id="dir-district" className="select" value={district} onChange={(e) => setDistrict(e.target.value)} disabled={!state}>
              <option value="">{state ? 'All districts' : 'Pick a state first'}</option>
              {districts.map((d) => <option key={d.district} value={d.district}>{d.district} ({d.count})</option>)}
            </select>
          </div>
          <div className="field" style={{ gridColumn: 'span 2' }}><label htmlFor="dir-q">Name, city or PIN code</label>
            <div className="search"><Search size={16} /><input id="dir-q" className="input" placeholder="For example: Civil Hospital, Karad or 416416" value={text} onChange={(e) => setText(e.target.value)} /></div>
          </div>
        </div>
        <label className="row small strong" style={{ marginTop: 12, width: 'fit-content', cursor: 'pointer' }}>
          <input type="checkbox" checked={components} onChange={(e) => setComponents(e.target.checked)} /> Only centres that separate blood components
        </label>
      </div>

      <div className="row between wrap">
        <span className="strong" aria-live="polite">{loading ? 'Searching…' : res ? `${res.total.toLocaleString('en-IN')} licensed centre${res.total === 1 ? '' : 's'}` : ''}</span>
        {meta && <span className="xs faint">Source: {meta.sources.map((s) => s.source).join('; ')}{meta.importedAt ? ` · loaded ${fmtDate(meta.importedAt)}` : ''}</span>}
      </div>
      {error && <Notice tone="warn">{error}</Notice>}

      <div className="grid g2">
        {res?.rows.map((c) => <CentreCard key={c.id} c={c} findBase={findBase} />)}
      </div>
      {res && !res.rows.length && !loading && <div className="card"><Empty title="No centre matches">Try another district or a shorter name.</Empty></div>}

      {pages > 1 && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="small muted">Page {page} of {pages}</span>
          <button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
      <Notice tone="info">Details come from government records and can change. Call before you travel. For live stock at centres not yet on Raktkoshika, use <a href={ERAKTKOSH_URL} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>e-RaktKosh</a>, the government’s blood bank portal.</Notice>
    </div>
  );
}

/** Inside the patient and hospital portals. */
export function DirectoryPage() {
  const { base } = useRole();
  return (
    <>
      <PageHead title="Licensed blood centres" sub="Every licensed centre from government records. Centres on Raktkoshika show live stock; for the rest, call or check e-RaktKosh." />
      <DirectoryBrowser findBase={`${base}/find`} />
    </>
  );
}
