import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, Clock, ExternalLink, Globe, Mail, MapPin, Navigation, Phone } from 'lucide-react';
import { apiMode, directory, ERAKTKOSH_URL, type DirectoryCentre } from '../../api/client';
import { CentresMap, type MapPoint } from '../../ui/CentresMap';
import { directionsUrl, fmtKm } from '../../ui/geo';
import { Badge, Empty, Logo, Notice } from '../../ui/kit';

const tel = (n: string) => n.split(/[,/;]| or /i)[0].replace(/[^\d+]/g, '');

/** Everything known about one blood bank in India, with a map and the blood banks around it. */
export default function CentreDetail() {
  const { id } = useParams();
  const [c, setC] = useState<DirectoryCentre | null>(null);
  const [near, setNear] = useState<(DirectoryCentre & { km: number })[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!apiMode) return;
    setC(null); setNear([]); setError('');
    directory.centre(Number(id)).then((r) => {
      setC(r);
      if (r.lat != null && r.lng != null) directory.nearby(r.lat, r.lng, 7).then((n) => setNear(n.filter((x) => x.id !== r.id))).catch(() => {});
    }).catch((e) => setError(e.message));
  }, [id]);

  const points = useMemo<MapPoint[]>(() => {
    if (!c || c.lat == null || c.lng == null) return [];
    const own: MapPoint = { id: `d${c.id}`, kind: 'network', units: undefined, lat: c.lat, lng: c.lng, name: c.name, lines: [[c.city || c.district, c.state].filter(Boolean).join(', ')], phone: tel(c.phone || c.mobile) || undefined };
    return [own, ...near.filter((n) => n.lat != null && n.lng != null).map((n): MapPoint => ({ id: `d${n.id}`, kind: 'directory', lat: n.lat!, lng: n.lng!, name: n.name, lines: [`${fmtKm(n.km)} from here`], phone: tel(n.phone || n.mobile) || undefined }))];
  }, [c, near]);

  const rows: [string, string][] = c ? ([
    ['Address', [c.address, c.city, c.district, c.state, c.pincode].filter(Boolean).join(', ')],
    ['Category', c.category], ['Open', c.serviceTime],
    ['Blood components', c.components == null ? '' : c.components ? 'Separates blood components' : 'Whole blood only'],
    ['Apheresis', c.apheresis == null ? '' : c.apheresis ? 'Available' : 'Not available'],
    ['Licence', [c.license, c.licenseDate && `issued ${c.licenseDate}`, c.renewalDate && `renewed ${c.renewalDate}`].filter(Boolean).join(' · ')],
    ['Source', c.source],
  ] as [string, string][]).filter(([, v]) => v) : [];

  return (
    <>
      <div style={{ background: '#16202E', color: '#F3F0EA', padding: '14px clamp(16px, 4vw, 56px)' }} className="row between">
        <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}><Logo size={30} /></Link>
        <div className="row">
          <Link to="/find?near=1" className="btn sm" style={{ background: 'rgba(255,255,255,.1)', color: '#fff', borderColor: 'rgba(255,255,255,.25)' }}>Find blood near me</Link>
          <Link to="/centres" className="btn sm" style={{ background: 'rgba(255,255,255,.1)', color: '#fff', borderColor: 'rgba(255,255,255,.25)' }}>All blood banks</Link>
        </div>
      </div>
      <main className="page">
        <Link to="/centres" className="link" style={{ marginBottom: 10 }}><ArrowLeft size={15} /> Blood banks in India</Link>
        {!apiMode && <Notice tone="info">Blood bank details need the Raktkoshika server.</Notice>}
        {error && <div className="card"><Empty title="Blood bank not found">{error}</Empty></div>}
        {c && (
          <div className="stack l">
            <header className="stack s">
              <div className="row wrap" style={{ gap: 6 }}>
                {c.category && <Badge>{c.category}</Badge>}
                {c.onNetwork && <Badge tone="good"><BadgeCheck size={11} /> On Raktkoshika, live stock</Badge>}
                {c.serviceTime && <Badge><Clock size={11} /> {c.serviceTime}</Badge>}
              </div>
              <h1 style={{ fontSize: 'clamp(26px, 4vw, 38px)' }}>{c.name}</h1>
              <p className="muted row" style={{ gap: 6, alignItems: 'flex-start' }}><MapPin size={16} style={{ marginTop: 3, flexShrink: 0 }} />{[c.address, c.city, c.district, c.state, c.pincode].filter(Boolean).join(', ')}</p>
              <div className="row wrap">
                {[c.phone, c.mobile].filter(Boolean).map((p) => <a key={p} className="btn primary" href={`tel:${tel(p)}`}><Phone size={15} /> {p}</a>)}
                {c.lat != null && c.lng != null && <a className="btn" href={directionsUrl(c.lat, c.lng)} target="_blank" rel="noreferrer"><Navigation size={15} /> Directions</a>}
                {c.email && <a className="btn" href={`mailto:${c.email}`}><Mail size={15} /> Email</a>}
                {c.website && <a className="btn" href={/^https?:/.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer"><Globe size={15} /> Website</a>}
                {c.onNetwork ? <Link className="btn" to="/find">See live stock</Link> : <a className="btn" href={ERAKTKOSH_URL} target="_blank" rel="noreferrer">Stock on e-RaktKosh <ExternalLink size={13} /></a>}
              </div>
            </header>

            <div className="grid g-main">
              <section className="stack s">
                {points.length ? <CentresMap points={points} here={null} height={380} /> : <Notice tone="info">This blood bank has no map location in the records.</Notice>}
                <div className="map-legend"><span><i style={{ background: '#C4283F' }} />This blood bank</span><span><i style={{ background: '#E8AE52' }} />Other blood banks nearby</span></div>
              </section>
              <section className="card">
                <div className="card-head"><h3>Details</h3></div>
                <div className="card-body stack s small">
                  {rows.map(([k, v]) => <div key={k} className="row between top" style={{ gap: 16 }}><span className="muted" style={{ flexShrink: 0 }}>{k}</span><span className="right">{v}</span></div>)}
                </div>
              </section>
            </div>

            {near.length > 0 && (
              <section className="card">
                <div className="card-head"><h3>Other blood banks nearby</h3></div>
                {near.map((n) => (
                  <Link key={n.id} className="list-row" to={`/centres/${n.id}`}>
                    <div className="grow"><b style={{ fontSize: 14.5 }}>{n.name}</b><div className="xs muted">{fmtKm(n.km)} · {[n.city || n.district, n.state].filter(Boolean).join(', ')}</div></div>
                    <span className="link">Details</span>
                  </Link>
                ))}
              </section>
            )}
            <Notice tone="info">Details come from public records and can change. Call before you travel.</Notice>
          </div>
        )}
      </main>
    </>
  );
}
