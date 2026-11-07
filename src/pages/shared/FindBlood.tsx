import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BadgeCheck, Clock, Crosshair, ExternalLink, Loader2, MapPin, Navigation, Phone, Star } from 'lucide-react';
import { compatibleDonors, COMPONENTS, COMPONENT_KEYS, GROUPS, inr, processingFee } from '../../data/rules';
import type { BloodGroup, Component } from '../../data/types';
import { useStore } from '../../store/store';
import { apiMode, directory, ERAKTKOSH_URL, type DirectoryCentre } from '../../api/client';
import { directionsUrl, distanceKm, fmtKm, locate, type Here } from '../../ui/geo';
import { useRole } from '../../layouts/Shell';
import { Badge, Empty, gl, Notice, PageHead } from '../../ui/kit';

export function FindResults({ orderBase }: { orderBase: string }) {
  const { db } = useStore();
  const [params] = useSearchParams();
  const [group, setGroup] = useState<BloodGroup>((params.get('group') as BloodGroup) || 'O+');
  const [comp, setComp] = useState<Component>((params.get('component') as Component) || 'PRBC');
  const [sort, setSort] = useState<'near' | 'stock'>('near');
  const [here, setHere] = useState<Here | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [others, setOthers] = useState<(DirectoryCentre & { km: number })[]>([]);

  const findMe = () => {
    setLocating(true); setGeoError('');
    locate().then((h) => { setHere(h); setSort('near'); }).catch((e) => setGeoError(e.message)).finally(() => setLocating(false));
  };
  // Opened with ?near=1 (from the home page): ask for location straight away.
  useEffect(() => { if (params.get('near') === '1') findMe(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Licensed centres from the government directory near the person, for places the network does not cover yet.
  useEffect(() => {
    if (!here || !apiMode) { setOthers([]); return; }
    directory.nearby(here.lat, here.lng, 8).then((r) => setOthers(r.filter((c) => !c.onNetwork))).catch(() => setOthers([]));
  }, [here]);

  const whereAmI = here;
  const rows = useMemo(() => {
    const avail = db.batches.filter((u) => u.status === 'available' && u.component === comp);
    const list = db.banks.filter((b) => b.verified).map((b) => {
      const here = avail.filter((u) => u.bankId === b.id);
      const km = whereAmI && b.lat != null && b.lng != null ? distanceKm(whereAmI, { lat: b.lat, lng: b.lng }) : b.km;
      return { b, km, exact: here.filter((u) => u.group === group).length, alt: here.filter((u) => u.group !== group && compatibleDonors(group, comp).includes(u.group)).length };
    });
    return list.sort((x, y) => (sort === 'near' ? (Number(y.exact > 0) - Number(x.exact > 0)) || x.km - y.km : y.exact - x.exact));
  }, [db.batches, db.banks, group, comp, sort, whereAmI]);
  const nearest = here ? rows.filter((r) => r.exact > 0).sort((a, b) => a.km - b.km)[0] : undefined;

  const total = rows.reduce((s, r) => s + r.exact, 0);
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
            <div className="small muted">{here ? `Your location is accurate to about ${fmtKm(here.accuracy / 1000)}. It stays on this device and is not saved.` : 'Share your location to sort centres by real distance from you.'}</div>
          </div>
        </div>
        <button className={`btn ${here ? '' : 'primary'}`} onClick={findMe} disabled={locating}>
          {locating ? <><Loader2 size={16} className="spin" /> Finding you…</> : here ? <><Crosshair size={16} /> Update location</> : <><Crosshair size={16} /> Use my location</>}
        </button>
      </div>
      {geoError && <Notice tone="warn">{geoError}</Notice>}

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
      {here && !nearest && <Notice tone="warn">No Raktkoshika centre has {gl(group)} {COMPONENTS[comp].short.toLowerCase()} in stock right now. See the licensed centres near you below, or check <a href={ERAKTKOSH_URL} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>e-RaktKosh</a>.</Notice>}

      <div className="row between wrap">
        <div className="strong" aria-live="polite">{total} unit{total === 1 ? '' : 's'} of {gl(group)} {COMPONENTS[comp].short.toLowerCase()} near you</div>
        <div className="chips">
          <button className={`chip ${sort === 'near' ? 'on' : ''}`} onClick={() => setSort('near')}>Nearest</button>
          <button className={`chip ${sort === 'stock' ? 'on' : ''}`} onClick={() => setSort('stock')}>Most stock</button>
        </div>
      </div>

      {total === 0 && <Notice tone="warn"><b>No exact match right now.</b> Post a donor request so eligible donors nearby can help{alts.length ? `, and ask the treating doctor whether ${alts.map(gl).join(', ')} may be suitable` : ''}.</Notice>}

      <div className="grid g2">
        {rows.map(({ b, km, exact, alt }) => (
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
        {!rows.length && <Empty title="No verified centres yet" />}
      </div>
      {others.length > 0 && (
        <section className="card">
          <div className="card-head"><h3>Other licensed centres near you</h3><span className="xs faint">Government directory · stock not on Raktkoshika</span></div>
          {others.map((c) => (
            <div className="list-row" key={c.id} style={{ flexWrap: 'wrap' }}>
              <div className="grow" style={{ minWidth: 200 }}>
                <b style={{ fontSize: 14.5 }}>{c.name}</b>
                <div className="xs muted">{fmtKm(c.km)} · {[c.city || c.district, c.state].filter(Boolean).join(', ')}{c.category ? ` · ${c.category}` : ''}{c.serviceTime ? ` · ${c.serviceTime}` : ''}</div>
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
