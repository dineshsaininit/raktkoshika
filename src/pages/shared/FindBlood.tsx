import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BadgeCheck, Clock, Crosshair, ExternalLink, Loader2, MapPin, Navigation, Phone, SlidersHorizontal, Star } from 'lucide-react';
import { compatibleDonors, COMPONENTS, COMPONENT_KEYS, GROUPS, inr, processingFee } from '../../data/rules';
import type { BloodGroup, Component, Bank } from '../../data/types';
import { useStore } from '../../store/store';
import { apiMode, directory, ERAKTKOSH_URL, type DirectoryCentre } from '../../api/client';
import { directionsUrl, distanceKm, fmtKm, locate, type Here } from '../../ui/geo';
import { CentresMap, type MapPoint } from '../../ui/CentresMap';
import { useRole } from '../../layouts/Shell';
import { Badge, Empty, gl, Notice, PageHead } from '../../ui/kit';

const NEAR_KM = 75;
const RADIUS_OPTIONS = [5, 10, 20, 30, 50, 75, 100, 200, 500] as const;
const DEFAULT_RADIUS = 30;

const DEFAULT_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];

const bankMatchesState = (b: Bank, st: string) => {
  if (!st) return true;
  const s = st.toLowerCase();
  const stateCodeMap: Record<string, string> = {
    mh: 'maharashtra', dl: 'delhi', ka: 'karnataka', gj: 'gujarat',
    tn: 'tamil nadu', up: 'uttar pradesh', rj: 'rajasthan', wb: 'west bengal',
    ap: 'andhra pradesh', ts: 'telangana', tg: 'telangana', kl: 'kerala',
    mp: 'madhya pradesh', pb: 'punjab', hr: 'haryana', br: 'bihar',
    ch: 'chandigarh', ga: 'goa', jk: 'jammu and kashmir', ut: 'uttarakhand',
    or: 'odisha', od: 'odisha', as: 'assam', jh: 'jharkhand', cg: 'chhattisgarh',
  };
  const licPrefix = (b.license.split('/')[0] || '').toLowerCase();
  if (licPrefix && stateCodeMap[licPrefix] === s) return true;
  if (b.city && s.includes(b.city.toLowerCase())) return true;
  if (b.district && s.includes(b.district.toLowerCase())) return true;
  return false;
};

export function FindResults({ orderBase }: { orderBase: string }) {
  const { db } = useStore();
  const [params] = useSearchParams();
  const [group, setGroup] = useState<BloodGroup>((params.get('group') as BloodGroup) || 'O+');
  const [comp, setComp] = useState<Component>((params.get('component') as Component) || 'PRBC');
  const [sort, setSort] = useState<'near' | 'stock'>('near');
  const [here, setHere] = useState<Here | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [place, setPlace] = useState('');
  const [state, setState] = useState('');
  const [states, setStates] = useState<{ state: string; count: number }[]>([]);
  const [others, setOthers] = useState<(DirectoryCentre & { km: number })[]>([]);
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_RADIUS);

  // Load available states for filtering
  useEffect(() => {
    if (!apiMode) {
      setStates(DEFAULT_STATES.map((s) => ({ state: s, count: 0 })));
      return;
    }
    directory.states().then((res) => {
      if (res && res.length) setStates(res);
      else setStates(DEFAULT_STATES.map((s) => ({ state: s, count: 0 })));
    }).catch(() => {
      setStates(DEFAULT_STATES.map((s) => ({ state: s, count: 0 })));
    });
  }, []);

  const findMe = () => {
    setLocating(true); setGeoError('');
    locate().then((h) => { setHere(h); setSort('near'); }).catch((e) => setGeoError(e.message)).finally(() => setLocating(false));
  };
  // Opened with ?near=1 (from the home page): ask for location straight away.
  useEffect(() => { if (params.get('near') === '1') findMe(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const whereAmI = here;

  // Licensed centres from the government directory near the person or in the selected state
  useEffect(() => {
    if (!apiMode) return;
    if (state) {
      directory.search({ state, size: 60 }).then((res) => {
        const mapped = res.rows.map((c) => {
          const km = whereAmI && c.lat != null && c.lng != null ? distanceKm(whereAmI, { lat: c.lat, lng: c.lng }) : 0;
          return { ...c, km };
        });
        setOthers(mapped.filter((c) => !c.onNetwork));
      }).catch(() => setOthers([]));
    } else if (here) {
      directory.nearby(here.lat, here.lng, 40).then((r) => setOthers(r.filter((c) => !c.onNetwork))).catch(() => setOthers([]));
    } else {
      setOthers([]);
    }
  }, [state, here, whereAmI]);

  const rows = useMemo(() => {
    const avail = db.batches.filter((u) => u.status === 'available' && u.component === comp);
    const list = db.banks.filter((b) => b.verified && bankMatchesState(b, state)).map((b) => {
      const here = avail.filter((u) => u.bankId === b.id);
      const km = whereAmI && b.lat != null && b.lng != null ? distanceKm(whereAmI, { lat: b.lat, lng: b.lng }) : b.km;
      return { b, km, exact: here.filter((u) => u.group === group).length, alt: here.filter((u) => u.group !== group && compatibleDonors(group, comp).includes(u.group)).length };
    });
    return list.sort((x, y) => (sort === 'near' ? (Number(y.exact > 0) - Number(x.exact > 0)) || x.km - y.km : y.exact - x.exact));
  }, [db.batches, db.banks, group, comp, sort, whereAmI, state]);

  // Filter rows by radius when location is available (unless user explicitly picks a state without radius constraint)
  const filteredRows = useMemo(() => {
    if (!here || state) return rows;
    return rows.filter((r) => r.km <= radiusKm);
  }, [rows, here, radiusKm, state]);

  // Filter others (directory centres) by radius too
  const filteredOthers = useMemo(() => {
    if (!here || state) return others;
    return others.filter((c) => c.km <= radiusKm);
  }, [others, here, radiusKm, state]);

  // Only suggest a network centre that is actually close; otherwise the nearest real blood bank leads.
  const nearest = here ? filteredRows.filter((r) => r.exact > 0 && r.km <= NEAR_KM).sort((a, b) => a.km - b.km)[0] : undefined;
  const realNearest = here ? filteredOthers[0] : undefined;
  const points = useMemo<MapPoint[]>(() => {
    const net: (MapPoint & { km: number })[] = filteredRows.filter((r) => r.b.lat != null && r.b.lng != null).map((r) => ({
      id: r.b.id, kind: 'network', lat: r.b.lat!, lng: r.b.lng!, name: r.b.name, units: r.exact, km: r.km, phone: r.b.phone.replace(/\s/g, ''),
      lines: [`${r.exact} unit${r.exact === 1 ? '' : 's'} of ${gl(group)} ${COMPONENTS[comp].short.toLowerCase()}`, `${r.b.city} · ${fmtKm(r.km)}${here ? '' : ' from Sangli'}`],
      requestUrl: r.exact > 0 ? `#${orderBase}?group=${encodeURIComponent(group)}&component=${comp}&bank=${r.b.id}` : undefined,
    }));
    const dirPts: (MapPoint & { km: number })[] = filteredOthers.filter((c) => c.lat != null && c.lng != null).map((c) => ({
      id: `d${c.id}`, kind: 'directory', lat: c.lat!, lng: c.lng!, name: c.name, km: c.km,
      phone: (c.phone || c.mobile).split(/[,/;]/)[0].replace(/[^\d+]/g, '') || undefined,
      lines: [[c.city || c.district, c.state].filter(Boolean).join(', '), `${c.km > 0 ? `${fmtKm(c.km)} away · ` : ''}stock: call or check e-RaktKosh`],
    }));
    return [...net, ...dirPts].sort((a, b) => a.km - b.km);
  }, [filteredRows, filteredOthers, group, comp, here, orderBase]);

  const total = filteredRows.reduce((s, r) => s + r.exact, 0);
  const alts = compatibleDonors(group, comp).filter((g) => g !== group);

  return (
    <div className="stack l">
      <div className="card pad stack">
        <div className="grid g-main" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18 }}>
          <div className="field">
            <span className="label">Blood group</span>
            <div className="chips">{GROUPS.map((g) => <button key={g} className={`chip ${group === g ? 'on' : ''}`} aria-pressed={group === g} onClick={() => setGroup(g)}>{gl(g)}</button>)}</div>
          </div>
          <div className="field">
            <span className="label">Component</span>
            <div className="chips">{COMPONENT_KEYS.map((c) => <button key={c} className={`chip ${comp === c ? 'on' : ''}`} aria-pressed={comp === c} onClick={() => setComp(c)}>{COMPONENTS[c].short}</button>)}</div>
          </div>
        </div>
      </div>

      <div className="card pad row between wrap" style={{ gap: 12, background: here ? 'var(--good-soft)' : undefined }}>
        <div className="row top grow" style={{ minWidth: 240 }}>
          <Crosshair size={20} style={{ color: here ? 'var(--good)' : 'var(--brand)', marginTop: 2 }} />
          <div>
            <b>{here ? 'Showing centres nearest to you' : 'Find the nearest blood centre'}</b>
            <div className="small muted">{here ? (here.label ? `Near ${here.label} (approximate, from the place you typed).` : `Your location is accurate to about ${fmtKm(here.accuracy / 1000)}. It stays on this device and is not saved.`) : 'Share your location, select your state, or type your PIN code or city, to see the blood banks closest to you.'}</div>
          </div>
        </div>
        <button className={`btn ${here ? '' : 'primary'}`} onClick={findMe} disabled={locating}>
          {locating ? <><Loader2 size={16} className="spin" /> Finding you…</> : here ? <><Crosshair size={16} /> Update location</> : <><Crosshair size={16} /> Use my location</>}
        </button>
      </div>
      {geoError && <Notice tone="warn">{geoError}</Notice>}

      {/* ── State filter & PIN/city search ── */}
      <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          <label htmlFor="filter-state" className="small strong muted" style={{ whiteSpace: 'nowrap' }}>State:</label>
          <select
            id="filter-state"
            className="select"
            style={{ minWidth: 170 }}
            value={state}
            onChange={(e) => {
              const val = e.target.value;
              setState(val);
              if (val && !here && apiMode) {
                directory.locate(val).then((r) => { setHere({ lat: r.lat, lng: r.lng, accuracy: 50000, label: r.label }); setSort('near'); }).catch(() => {});
              }
            }}
            aria-label="Filter by state"
          >
            <option value="">All States</option>
            {states.map((s) => (
              <option key={s.state} value={s.state}>
                {s.state} {s.count ? `(${s.count})` : ''}
              </option>
            ))}
          </select>
        </div>

        {apiMode && (
          <form className="row wrap grow" style={{ gap: 8 }} onSubmit={(e) => {
            e.preventDefault();
            if (!place.trim()) return;
            setLocating(true); setGeoError('');
            const query = state && !place.toLowerCase().includes(state.toLowerCase()) ? `${place.trim()}, ${state}` : place.trim();
            directory.locate(query).catch(() => directory.locate(place.trim()))
              .then((r) => { setHere({ lat: r.lat, lng: r.lng, accuracy: 5000, label: r.label }); setSort('near'); })
              .catch((err) => setGeoError(err.message)).finally(() => setLocating(false));
          }}>
            <input className="input grow" style={{ maxWidth: 360 }} placeholder="Or type your PIN code or city, like 416416 or Kolhapur" aria-label="PIN code or city" value={place} onChange={(e) => setPlace(e.target.value)} />
            <button className="btn" disabled={!place.trim() || locating}>Search this place</button>
          </form>
        )}
      </div>

      {/* ── Radius filter ── */}
      {here && !state && (
        <div className="card pad" style={{ background: 'var(--bg-2)' }}>
          <div className="row between wrap" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 8 }}>
              <SlidersHorizontal size={16} style={{ color: 'var(--brand)', flexShrink: 0, marginTop: 1 }} />
              <span className="strong" style={{ fontSize: 14 }}>Search radius</span>
            </div>
            <span className="strong" style={{ fontSize: 18, color: 'var(--brand)', minWidth: 60, textAlign: 'right' }}>{radiusKm} km</span>
          </div>
          <input
            type="range"
            min={0}
            max={RADIUS_OPTIONS.length - 1}
            value={RADIUS_OPTIONS.indexOf(radiusKm as typeof RADIUS_OPTIONS[number])}
            onChange={(e) => setRadiusKm(RADIUS_OPTIONS[Number(e.target.value)])}
            style={{ width: '100%', marginTop: 8, accentColor: 'var(--brand)', cursor: 'pointer' }}
            aria-label="Search radius in kilometres"
          />
          <div className="row between" style={{ marginTop: 4 }}>
            <span className="xs muted">{RADIUS_OPTIONS[0]} km</span>
            <span className="xs muted">{RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1]} km</span>
          </div>
          <div className="chips" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            {RADIUS_OPTIONS.map((r) => (
              <button key={r} className={`chip ${radiusKm === r ? 'on' : ''}`} aria-pressed={radiusKm === r} onClick={() => setRadiusKm(r)}>{r} km</button>
            ))}
          </div>
        </div>
      )}

      <section className="stack s" aria-label="Map">
        <CentresMap points={points} here={here} />
        <div className="map-legend">
          <span><i style={{ background: '#C4283F' }} />Raktkoshika centre (number = units in stock)</span>
          <span><i style={{ background: '#E8AE52' }} />Licensed centre near you (stock not on Raktkoshika)</span>
          {here && <span><i style={{ background: '#1570B8' }} />You</span>}
        </div>
      </section>

      {/* ── Nearest blood bank (appears right below the map) ── */}
      {realNearest && (
        <section className="card pad stack s" aria-label="Nearest blood bank to you" style={{ borderColor: 'var(--good)' }}>
          <div className="row between wrap">
            <Badge tone="good">Nearest blood bank to you</Badge>
            {realNearest.km > 0 && <span className="small strong">{fmtKm(realNearest.km)} away</span>}
          </div>
          <div>
            <h3 style={{ fontSize: 19 }}>{realNearest.name}</h3>
            <div className="small muted">{[realNearest.address, realNearest.city || realNearest.district, realNearest.state].filter(Boolean).join(', ')}</div>
            <div className="xs faint" style={{ marginTop: 3 }}>{[realNearest.category, realNearest.serviceTime && `Open ${realNearest.serviceTime}`].filter(Boolean).join(' · ')}{realNearest.onNetwork ? '' : ' · live stock not on Raktkoshika yet'}</div>
          </div>
          <div className="row wrap">
            {(realNearest.phone || realNearest.mobile) && <a className="btn primary" href={`tel:${(realNearest.phone || realNearest.mobile).split(/[,/;]/)[0].replace(/[^\d+]/g, '')}`}><Phone size={15} /> Call to check stock</a>}
            {realNearest.lat != null && realNearest.lng != null && <a className="btn" href={directionsUrl(realNearest.lat, realNearest.lng)} target="_blank" rel="noreferrer"><Navigation size={15} /> Directions</a>}
            <Link className="btn" to={`/centres/${realNearest.id}`}>Details</Link>
            <a className="btn" href={ERAKTKOSH_URL} target="_blank" rel="noreferrer">Stock on e-RaktKosh <ExternalLink size={13} /></a>
          </div>
        </section>
      )}

      {nearest && nearest.b.lat != null && nearest.b.lng != null && (
        <section className="card pad stack s" style={{ borderColor: 'var(--brand)', boxShadow: '0 16px 40px -24px var(--brand)' }} aria-label="Nearest centre with stock">
          <div className="row between wrap">
            <Badge tone="good">Nearest with {gl(group)} {COMPONENTS[comp].short.toLowerCase()} in stock</Badge>
            <span className="small strong">{fmtKm(nearest.km)} away</span>
          </div>
          <div className="row between wrap top">
            <div className="grow" style={{ minWidth: 220 }}>
              <h3 style={{ fontSize: 20 }}>{nearest.b.name}</h3>
              <div className="small muted">{nearest.b.city} · {nearest.b.type} · {nearest.b.open24 ? 'Open 24×7' : 'Open 8 am–8 pm'} · stock updated {nearest.b.syncMin} min ago</div>
            </div>
            <div className="center"><div style={{ font: '800 36px/1 var(--display)' }}>{nearest.exact}</div><div className="xs faint">units available</div></div>
          </div>
          <div className="row wrap">
            <Link className="btn primary" to={`${orderBase}?group=${encodeURIComponent(group)}&component=${comp}&bank=${nearest.b.id}`}>Request from here</Link>
            <a className="btn" href={directionsUrl(nearest.b.lat, nearest.b.lng)} target="_blank" rel="noreferrer"><Navigation size={15} /> Directions</a>
            <a className="btn" href={`tel:${nearest.b.phone.replace(/\s/g, '')}`}><Phone size={15} /> Call</a>
          </div>
        </section>
      )}
      {here && !nearest && !state && <Notice tone="warn">No Raktkoshika centre within {radiusKm} km has {gl(group)} {COMPONENTS[comp].short.toLowerCase()} in stock right now. {radiusKm < 100 && <>Try increasing the search radius. </>}See the licensed centres near you below, or check <a href={ERAKTKOSH_URL} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>e-RaktKosh</a>.</Notice>}
      {state && !nearest && <Notice tone="warn">No verified Raktkoshika centre with live stock for {gl(group)} {COMPONENTS[comp].short.toLowerCase()} in {state} yet. See the licensed centres from government records below, or check <a href={ERAKTKOSH_URL} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>e-RaktKosh</a>.</Notice>}

      <div className="row between wrap">
        <div className="strong" aria-live="polite">
          {total} unit{total === 1 ? '' : 's'} of {gl(group)} {COMPONENTS[comp].short.toLowerCase()}
          {state ? ` in ${state}` : here ? ` within ${radiusKm} km` : ' near you'}
        </div>
        <div className="chips">
          <button className={`chip ${sort === 'near' ? 'on' : ''}`} onClick={() => setSort('near')}>Nearest</button>
          <button className={`chip ${sort === 'stock' ? 'on' : ''}`} onClick={() => setSort('stock')}>Most stock</button>
        </div>
      </div>

      {total === 0 && <Notice tone="warn"><b>No exact match right now.</b> Post a donor request so eligible donors nearby can help{alts.length ? `, and ask the treating doctor whether ${alts.map(gl).join(', ')} may be suitable` : ''}.</Notice>}

      <div className="grid g2">
        {filteredRows.map(({ b, km, exact, alt }) => (
          <article className="card pad stack s" key={b.id}>
            <div className="row between top">
              <div className="grow">
                <h3 style={{ fontSize: 17 }} className="row" >{b.name}</h3>
                <div className="row wrap small muted" style={{ gap: 12, marginTop: 5 }}>
                  <span className="row" style={{ gap: 4 }}><MapPin size={13} /> {b.city} · {fmtKm(km)}{here ? '' : ' from Sangli'}</span>
                  <span className="row" style={{ gap: 4 }}><Star size={13} /> {b.rating}</span>
                  <span className="row" style={{ gap: 4 }}><BadgeCheck size={13} /> {b.type}</span>
                </div>
              </div>
              <div className="center">
                <div style={{ font: '800 30px/1 var(--display)', color: exact ? 'var(--ink)' : 'var(--ink-3)' }}>{exact}</div>
                <div className="xs faint">units</div>
              </div>
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              {b.open24 ? <Badge tone="good">Open 24×7</Badge> : <Badge>Open 8 am–8 pm</Badge>}
              {b.syncMin > 30 ? <Badge tone="warn"><Clock size={11} /> Stock updated {b.syncMin} min ago, call first</Badge> : <Badge><Clock size={11} /> Updated {b.syncMin} min ago</Badge>}
              {alt > 0 && <Badge tone="info">{alt} compatible, ask doctor</Badge>}
            </div>
            <hr className="divider" />
            <div className="row between wrap">
              <div className="small"><span className="muted">Processing charge </span><b>{inr(processingFee(comp, b))}</b><span className="muted"> per unit</span></div>
              <div className="row">
                <a className="btn sm icon" href={`tel:${b.phone.replace(/\s/g, '')}`} aria-label={`Call ${b.name}`}><Phone size={15} /></a>
                {exact > 0
                  ? <Link className="btn sm primary" to={`${orderBase}?group=${encodeURIComponent(group)}&component=${comp}&bank=${b.id}`}>Request</Link>
                  : <button className="btn sm" disabled>Out of stock</button>}
              </div>
            </div>
          </article>
        ))}
        {!filteredRows.length && here && !state && <Empty title={`No centres within ${radiusKm} km`} />}
        {!filteredRows.length && state && <Empty title={`No network centres with live stock in ${state}`} />}
        {!filteredRows.length && !here && !state && !rows.length && <Empty title="No verified centres yet" />}
      </div>
      {filteredOthers.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h3>{state ? `Licensed centres in ${state}` : 'Other licensed centres near you'}</h3>
            <span className="xs faint">Government directory · stock not on Raktkoshika</span>
          </div>
          {filteredOthers.slice(0, 16).map((c) => (
            <div className="list-row" key={c.id} style={{ flexWrap: 'wrap' }}>
              <div className="grow" style={{ minWidth: 200 }}>
                <b style={{ fontSize: 14.5 }}>{c.name}</b>
                <div className="xs muted">{c.km > 0 ? `${fmtKm(c.km)} · ` : ''}{[c.city || c.district, c.state].filter(Boolean).join(', ')}{c.category ? ` · ${c.category}` : ''}{c.serviceTime ? ` · ${c.serviceTime}` : ''}</div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {(c.phone || c.mobile) && <a className="btn sm icon" href={`tel:${(c.phone || c.mobile).split(/[,/;]/)[0].replace(/[^\d+]/g, '')}`} aria-label={`Call ${c.name}`}><Phone size={14} /></a>}
                {c.lat != null && c.lng != null && <a className="btn sm icon" href={directionsUrl(c.lat, c.lng)} target="_blank" rel="noreferrer" aria-label={`Directions to ${c.name}`}><Navigation size={14} /></a>}
                <a className="btn sm" href={ERAKTKOSH_URL} target="_blank" rel="noreferrer">Stock <ExternalLink size={12} /></a>
              </div>
            </div>
          ))}
        </section>
      )}
      <Notice tone="info">These are centres on the Raktkoshika network. For every other licensed centre, see the <Link to={orderBase.startsWith('/app') ? orderBase.replace(/\/order$/, '/centres') : '/centres'} style={{ fontWeight: 600 }}>government directory</Link> or check stock on <a href={ERAKTKOSH_URL} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>e-RaktKosh</a>.</Notice>
    </div>
  );
}

export function FindBlood() {
  const { base } = useRole();
  return (
    <>
      <PageHead title="Find blood" sub="Live stock from verified centres. Charges are the government-set processing cost, with nothing added." >
        
      </PageHead>
      <FindResults orderBase={`${base}/order`} />
    </>
  );
}
