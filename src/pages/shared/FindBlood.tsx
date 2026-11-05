import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BadgeCheck, Clock, MapPin, Phone, Star } from 'lucide-react';
import { compatibleDonors, COMPONENTS, COMPONENT_KEYS, GROUPS, inr, processingFee } from '../../data/rules';
import type { BloodGroup, Component } from '../../data/types';
import { useStore } from '../../store/store';
import { useRole } from '../../layouts/Shell';
import { Badge, Empty, gl, Notice, PageHead } from '../../ui/kit';

export function FindResults({ orderBase }: { orderBase: string }) {
  const { db } = useStore();
  const [params] = useSearchParams();
  const [group, setGroup] = useState<BloodGroup>((params.get('group') as BloodGroup) || 'O+');
  const [comp, setComp] = useState<Component>((params.get('component') as Component) || 'PRBC');
  const [sort, setSort] = useState<'near' | 'stock'>('near');

  const rows = useMemo(() => {
    const avail = db.batches.filter((u) => u.status === 'available' && u.component === comp);
    const list = db.banks.filter((b) => b.verified).map((b) => {
      const here = avail.filter((u) => u.bankId === b.id);
      return { b, exact: here.filter((u) => u.group === group).length, alt: here.filter((u) => u.group !== group && compatibleDonors(group, comp).includes(u.group)).length };
    });
    return list.sort((x, y) => (sort === 'near' ? (Number(y.exact > 0) - Number(x.exact > 0)) || x.b.km - y.b.km : y.exact - x.exact));
  }, [db.batches, db.banks, group, comp, sort]);

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

      <div className="row between wrap">
        <div className="strong" aria-live="polite">{total} unit{total === 1 ? '' : 's'} of {gl(group)} {COMPONENTS[comp].short.toLowerCase()} near you</div>
        <div className="chips">
          <button className={`chip ${sort === 'near' ? 'on' : ''}`} onClick={() => setSort('near')}>Nearest</button>
          <button className={`chip ${sort === 'stock' ? 'on' : ''}`} onClick={() => setSort('stock')}>Most stock</button>
        </div>
      </div>

      {total === 0 && <Notice tone="warn"><b>No exact match right now.</b> Post a donor request so eligible donors nearby can help{alts.length ? `, and ask the treating doctor whether ${alts.map(gl).join(', ')} may be suitable` : ''}.</Notice>}

      <div className="grid g2">
        {rows.map(({ b, exact, alt }) => (
          <article className="card pad stack s" key={b.id}>
            <div className="row between top">
              <div className="grow">
                <h3 style={{ fontSize: 17 }} className="row" >{b.name}</h3>
                <div className="row wrap small muted" style={{ gap: 12, marginTop: 5 }}>
                  <span className="row" style={{ gap: 4 }}><MapPin size={13} /> {b.city} · {b.km} km</span>
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
