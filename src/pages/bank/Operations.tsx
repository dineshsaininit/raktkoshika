import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Check, ClipboardCheck, Droplets, FileText, Megaphone, PackageX, Repeat2, Search, ShieldCheck, Syringe, Timer, Truck, X } from 'lucide-react';
import { COMPONENTS, COMPONENT_KEYS, daysLeft, fmtDate, fmtDT, GROUPS, inr, MIN_HB, stageIndex, stageLabel, STAGES } from '../../data/rules';
import type { BloodGroup, Component, Order } from '../../data/types';
import { useStore } from '../../store/store';
import { RxLink } from '../../ui/RxLink';
import { useRole } from '../../layouts/Shell';
import { BagGauge, Badge, Empty, Field, GroupPicker, gl, GroupTag, LineChart, Modal, Notice, PageHead, Stat, Tabs, useToast } from '../../ui/kit';
import { isOpen, MiniTrack } from '../shared/Orders';

function useCentre() {
  const { db } = useStore();
  const { me } = useRole();
  const units = db.batches.filter((u) => u.bankId === me);
  const shelf = units.filter((u) => u.status === 'available');
  const queue = db.orders.filter((o) => o.bankId === me && isOpen(o)).sort((a, b) => Number(b.urgency === 'sos') - Number(a.urgency === 'sos') || a.events[0].at.localeCompare(b.events[0].at));
  return { units, shelf, queue };
}

export function BankHome() {
  const { db } = useStore();
  const { me, base } = useRole();
  const { shelf, queue, units } = useCentre();
  const [broadcast, setBroadcast] = useState<BloodGroup | null>(null);
  const expiring = shelf.filter((u) => daysLeft(u.expiry) <= 3);
  const today = db.donations.filter((d) => d.bankId === me && d.status === 'booked');
  const red = GROUPS.map((g) => ({ g, n: shelf.filter((u) => u.group === g && u.component === 'PRBC').length }));
  const low = red.filter((r) => r.n <= 2);
  const quarantine = units.filter((u) => u.status === 'quarantine').length;
  const redMax = Math.max(14, ...red.map((r) => r.n));
  const outOfRange = db.sensors.filter((s) => s.bankId === me && (s.temp < s.min || s.temp > s.max));

  return (
    <>
      <PageHead title={`Today at ${db.banks.find((b) => b.id === me)?.name.replace(/ Blood Centre$/, '') ?? 'your centre'}`} sub={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}>
        <Link className="btn" to={`${base}/reports`}><FileText size={16} /> Reports</Link>
        <Link className="btn primary" to={`${base}/requests`}>Open requests <ArrowRight size={16} /></Link>
      </PageHead>

      {(low.length > 0 || expiring.length > 0 || outOfRange.length > 0) && (
        <div className="stack s" style={{ marginBottom: 16 }}>
          {low.length > 0 && (
            <Notice tone="crit">
              <div className="row between wrap">
                <span><b>{low.length} red cell group{low.length > 1 ? 's are' : ' is'} running low.</b> Pick one to alert its donors.</span>
                <div className="row wrap" style={{ gap: 6 }}>
                  {low.map((l) => <button key={l.g} className="btn sm" aria-label={`Alert ${l.g} donors, ${l.n} units left`} onClick={() => setBroadcast(l.g)}><Megaphone size={13} /> {gl(l.g)} · {l.n} left</button>)}
                </div>
              </div>
            </Notice>
          )}
          {expiring.length > 0 && <Notice tone="warn"><div className="row between wrap"><span><b>{expiring.length} units expire within 3 days.</b> Use them first, or offer them to a nearby centre.</span><Link className="btn sm" to={`${base}/stock`}>Review</Link></div></Notice>}
        </div>
      )}

      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Stat icon={<Droplets size={15} />} label="Units on shelf" value={shelf.length} sub={`${quarantine} more in screening`} />
        <Stat icon={<ClipboardCheck size={15} />} label="Open requests" value={queue.length} sub={`${queue.filter((o) => o.urgency === 'sos').length} emergency`} />
        <Stat icon={<Syringe size={15} />} label="Donor slots booked" value={today.length} sub="Next few days" />
        <Stat icon={<Timer size={15} />} label="Expiring soon" value={expiring.length} sub="Within 3 days" />
      </div>

      <div className="grid g-main">
        <div className="stack">
          <section className="card">
            <div className="card-head"><h3>Red cells on the shelf</h3><Link className="link" to={`${base}/stock`}>Full stock <ArrowRight size={14} /></Link></div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(66px, 1fr))', gap: 8 }}>
                {red.map(({ g, n }) => (
                  <div className="center" key={g}>
                    <BagGauge level={n / redMax} size={46} />
                    <div style={{ font: '800 17px var(--display)' }}>{gl(g)}</div>
                    <div className={`xs ${n <= 2 ? 'strong brand-text' : 'faint'}`}>{n} unit{n === 1 ? '' : 's'}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h3>Collected and issued</h3><span className="xs faint">Units, last 12 months</span></div>
            <div className="card-body"><LineChart label="Units collected and issued per month" x={db.months.map((m) => m.m)} series={[{ name: 'Collected', color: 'var(--s2)', values: db.months.map((m) => m.collected) }, { name: 'Issued', color: 'var(--s1)', values: db.months.map((m) => m.issued) }]} /></div>
          </section>
        </div>
        <section className="card">
          <div className="card-head"><h3>Next in the queue</h3><Link className="link" to={`${base}/requests`}>All</Link></div>
          {queue.slice(0, 6).map((o) => (
            <Link to={`${base}/requests`} className="list-row" key={o.id} style={{ alignItems: 'flex-start' }}>
              <GroupTag g={o.group} />
              <div className="grow">
                <div className="row wrap" style={{ gap: 6 }}><b className="truncate">{o.patient.name}</b>{o.urgency === 'sos' && <Badge tone="crit">Emergency</Badge>}</div>
                <div className="xs muted">{o.units} × {COMPONENTS[o.component].short} · {stageLabel(o.stage)}</div>
                <div style={{ marginTop: 6 }}><MiniTrack o={o} /></div>
              </div>
            </Link>
          ))}
          {!queue.length && <Empty icon={<Check size={26} />} title="Queue is clear" />}
        </section>
      </div>
      {broadcast && <BroadcastModal initial={broadcast} onClose={() => setBroadcast(null)} from={me} />}
    </>
  );
}

export function BroadcastModal({ initial, onClose, from }: { initial: BloodGroup; onClose: () => void; from: string }) {
  const { act } = useStore();
  const toast = useToast();
  const [group, setGroup] = useState(initial);
  const [city, setCity] = useState('Sangli');
  const [note, setNote] = useState(`${gl(initial)} stock is running low. If you are eligible, please book a slot this week.`);
  return (
    <Modal title="Alert donors" sub="Goes only to opted-in donors of this group in this area who are eligible today." onClose={onClose}>
      <div className="stack">
        <div className="field"><span className="label">Blood group</span><GroupPicker value={group} onChange={(g) => { setGroup(g); setNote(`${gl(g)} stock is running low. If you are eligible, please book a slot this week.`); }} /></div>
        <Field label="Area"><input className="input" value={city} onChange={(e) => setCity(e.target.value)} /></Field>
        <Field label="Message"><textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <button className="btn primary block" disabled={!note.trim() || !city.trim()} onClick={() => { act.broadcast(group, city, note, from); onClose(); toast(`Alert sent to ${gl(group)} donors in ${city}`); }}><Megaphone size={16} /> Send alert</button>
      </div>
    </Modal>
  );
}

/* ---------- requests ---------- */
export function BankRequests() {
  const { db, act } = useStore();
  const { me, persona } = useRole();
  const toast = useToast();
  const [tab, setTab] = useState<'open' | 'scheduled' | 'closed'>('open');
  const [view, setView] = useState<Order | null>(null);
  const [decline, setDecline] = useState<Order | null>(null);
  const [reason, setReason] = useState('Compatible units are not available');
  const all = db.orders.filter((o) => o.bankId === me);
  const scheduled = (o: Order) => isOpen(o) && !!o.scheduledFor;
  const list = all.filter((o) => (tab === 'open' ? isOpen(o) && !o.scheduledFor : tab === 'scheduled' ? scheduled(o) : !isOpen(o)))
    .sort((a, b) => Number(b.urgency === 'sos') - Number(a.urgency === 'sos'));
  const stockFor = (o: Order) => db.batches.filter((u) => u.bankId === me && u.group === o.group && u.component === o.component && u.status === 'available').length;
  const fresh = view && db.orders.find((o) => o.id === view.id);

  return (
    <>
      <PageHead title="Requests" sub="Every request moves through the same safe steps. Units are allocated closest-expiry first." />
      <div className="card">
        <div style={{ padding: '4px 12px 0' }}><Tabs value={tab} onChange={setTab} items={[{ k: 'open', label: 'Today', n: all.filter((o) => isOpen(o) && !o.scheduledFor).length }, { k: 'scheduled', label: 'Scheduled & booked', n: all.filter(scheduled).length }, { k: 'closed', label: 'Closed', n: all.filter((o) => !isOpen(o)).length }]} /></div>
        {list.map((o) => {
          const i = stageIndex(o.stage);
          const needsStock = o.stage === 'sample_received' && stockFor(o) < o.units;
          const action = isOpen(o) ? STAGES[i]?.action : '';
          return (
            <div className="list-row" key={o.id} style={{ flexWrap: 'wrap', borderLeft: o.urgency === 'sos' && isOpen(o) ? '3px solid var(--brand)' : undefined }}>
              <GroupTag g={o.group} />
              <button className="grow" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', minWidth: 180 }} onClick={() => setView(o)}>
                <span className="row wrap" style={{ gap: 6 }}><b>{o.patient.name}</b>{o.urgency === 'sos' && <Badge tone="crit">Emergency</Badge>}{o.reaction && <Badge tone="crit">Reaction</Badge>}</span>
                <span className="small muted" style={{ display: 'block' }}>{o.units} × {COMPONENTS[o.component].short} · {o.patient.hospital}</span>
                <span className="xs faint" style={{ display: 'block' }}>{o.id}{o.scheduledFor ? ` · for ${fmtDT(o.scheduledFor)}` : ` · ${fmtDT(o.events[0].at)}`} · {o.payment.method === 'wallet' ? `${inr(o.payment.cash)} ${o.payment.settled ? 'settled' : 'held'}` : 'pays at counter'}</span>
              </button>
              <div className="stack s hide-m" style={{ width: 150 }}><span className="xs muted">{stageLabel(o.stage)}</span>{isOpen(o) && <MiniTrack o={o} />}</div>
              {isOpen(o) && (
                <div className="row">
                  {i < stageIndex('issued') && <button className="btn sm icon quiet" aria-label={`Decline ${o.id}`} onClick={() => setDecline(o)}><X size={15} /></button>}
                  <button className="btn sm primary" disabled={needsStock} title={needsStock ? 'Not enough units in stock' : ''} onClick={() => { act.advanceOrder(o.id, persona.name); toast(`${o.id}: ${action}`); }}>{needsStock ? 'Not enough stock' : action}</button>
                </div>
              )}
              {!isOpen(o) && <Badge tone={o.stage === 'completed' ? 'good' : undefined}>{stageLabel(o.stage)}</Badge>}
            </div>
          );
        })}
        {!list.length && <Empty icon={<ClipboardCheck size={26} />} title="Nothing here" />}
      </div>

      {fresh && (
        <Modal title={fresh.id} sub={`${fresh.patient.name}, ${fresh.patient.age} years`} onClose={() => setView(null)}>
          <div className="stack s small">
            <div className="row between"><span className="muted">Needs</span><b>{fresh.units} × {gl(fresh.group)} {COMPONENTS[fresh.component].name}</b></div>
            <div className="row between"><span className="muted">In stock now</span><b>{stockFor(fresh)} units</b></div>
            <div className="row between top"><span className="muted">Hospital</span><span className="right">{fresh.patient.hospital}, {fresh.patient.ward}</span></div>
            <div className="row between"><span className="muted">Doctor</span><span>{fresh.patient.doctor}</span></div>
            <div className="row between"><span className="muted">Prescription</span><RxLink name={fresh.rx} fileId={fresh.rxFileId} /></div>
            <div className="row between"><span className="muted">Handover</span><span className="row" style={{ gap: 5 }}>{fresh.fulfilment === 'delivery' ? <><Truck size={14} /> Cold-chain rider</> : 'Attendant collects'}</span></div>
            <div className="row between"><span className="muted">Payment</span><span>{inr(fresh.payment.total)} {fresh.payment.creditsUsed ? `(${fresh.payment.creditsUsed} credit used)` : ''}</span></div>
            {db.batches.some((u) => u.orderId === fresh.id) && <div className="row between"><span className="muted">Allocated units</span><span className="num strong">{db.batches.filter((u) => u.orderId === fresh.id).map((u) => u.id).join(', ')}</span></div>}
            {fresh.reaction && <Notice tone="crit"><b>Reaction reported:</b> {fresh.reaction}</Notice>}
          </div>
        </Modal>
      )}
      {decline && (
        <Modal title={`Decline ${decline.id}?`} sub="The family is told at once, and their held money is returned." onClose={() => setDecline(null)}>
          <div className="stack">
            <div className="stack s">{['Compatible units are not available', 'Prescription is unclear or invalid', 'Sample could not be cross-matched'].map((r) => <button key={r} className={`choice ${reason === r ? 'on' : ''}`} onClick={() => setReason(r)}><span className="tick" /><span>{r}</span></button>)}</div>
            <button className="btn primary block" onClick={() => { act.closeOrder(decline.id, persona.name, 'rejected', reason); setDecline(null); toast('Request declined. Money returned to the family.'); }}>Decline request</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ---------- stock ---------- */
export function BankStock() {
  const { db, act } = useStore();
  const { me, persona } = useRole();
  const toast = useToast();
  const { units, shelf } = useCentre();
  const [tab, setTab] = useState<'shelf' | 'units' | 'screen' | 'expiring'>('shelf');
  const [q, setQ] = useState('');
  const [comp, setComp] = useState<Component | 'all'>('all');
  const [discard, setDiscard] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<string | null>(null);
  const [reason, setReason] = useState('Expired');
  const others = db.banks.filter((b) => b.id !== me);
  const [target, setTarget] = useState(others[0]?.id ?? '');
  const quarantine = units.filter((u) => u.status === 'quarantine');
  const expiring = useMemo(() => shelf.filter((u) => daysLeft(u.expiry) <= 3).sort((a, b) => a.expiry.localeCompare(b.expiry)), [shelf]);
  const rows = useMemo(() => shelf.filter((u) => (comp === 'all' || u.component === comp) && `${u.id} ${u.group} ${u.source}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.expiry.localeCompare(b.expiry)), [shelf, comp, q]);
  const cell = (n: number) => (n === 0 ? { background: 'var(--crit-soft)', color: 'var(--crit)' } : n <= 2 ? { background: 'var(--warn-soft)', color: 'var(--warn)' } : { background: 'var(--surface-3)' });
  const unitRow = (u: (typeof units)[number]) => {
    const left = daysLeft(u.expiry);
    return (
      <tr key={u.id}>
        <td className="num strong">{u.id}</td>
        <td><GroupTag g={u.group} size="sm" /></td>
        <td>{COMPONENTS[u.component].short}</td>
        <td className="hide-m">{fmtDate(u.collected)}</td>
        <td>{left <= 3 ? <Badge tone={left <= 1 ? 'crit' : 'warn'}>{left <= 0 ? 'Today' : `${left} day${left > 1 ? 's' : ''}`}</Badge> : `${left} days`}</td>
        <td className="hide-m">{u.source}</td>
        <td className="r"><div className="row" style={{ justifyContent: 'flex-end', gap: 4 }}>
          <button className="btn sm icon quiet" aria-label={`Transfer ${u.id}`} title="Transfer to another centre" onClick={() => setTransfer(u.id)}><Repeat2 size={15} /></button>
          <button className="btn sm icon quiet" aria-label={`Discard ${u.id}`} title="Discard" onClick={() => setDiscard(u.id)}><PackageX size={15} /></button>
        </div></td>
      </tr>
    );
  };
  const head = <thead><tr><th>Unit</th><th>Group</th><th>Component</th><th className="hide-m">Collected</th><th>Expires in</th><th className="hide-m">Source</th><th className="r">Actions</th></tr></thead>;

  return (
    <>
      <PageHead title="Blood stock" sub="Tracked unit by unit, from collection to issue. Availability updates the moment anything changes." />
      <div className="card">
        <div style={{ padding: '4px 12px 0' }}><Tabs value={tab} onChange={setTab} items={[{ k: 'shelf', label: 'Overview' }, { k: 'units', label: 'All units', n: shelf.length }, { k: 'screen', label: 'In screening', n: quarantine.length }, { k: 'expiring', label: 'Expiring', n: expiring.length }]} /></div>

        {tab === 'shelf' && (
          <div className="card-body table-wrap">
            <div className="heat" role="table" aria-label="Stock by component and blood group">
              <div className="h" />
              {GROUPS.map((g) => <div className="h" key={g}>{gl(g)}</div>)}
              {COMPONENT_KEYS.map((c) => (
                <Fragment key={c}>
                  <div className="n">{COMPONENTS[c].short}</div>
                  {GROUPS.map((g) => { const n = shelf.filter((u) => u.group === g && u.component === c).length; return <div className="c" style={cell(n)} key={g} aria-label={`${COMPONENTS[c].short} ${g}: ${n}`}>{n}</div>; })}
                </Fragment>
              ))}
            </div>
            <div className="row wrap small muted" style={{ marginTop: 14, gap: 16 }}><span>Storage:</span>{COMPONENT_KEYS.slice(0, 3).map((c) => <span key={c}>{COMPONENTS[c].short} {COMPONENTS[c].storage}</span>)}<span>Plasma & cryo {COMPONENTS.FFP.storage}</span></div>
          </div>
        )}

        {tab === 'units' && (
          <>
            <div className="row wrap" style={{ padding: '14px 16px' }}>
              <div className="search grow" style={{ minWidth: 200 }}><Search size={16} /><input className="input" placeholder="Search unit, group or source" aria-label="Search units" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <select className="select" style={{ width: 'auto' }} aria-label="Component" value={comp} onChange={(e) => setComp(e.target.value as Component | 'all')}><option value="all">All components</option>{COMPONENT_KEYS.map((c) => <option value={c} key={c}>{COMPONENTS[c].short}</option>)}</select>
            </div>
            <div className="table-wrap"><table className="table">{head}<tbody>{rows.slice(0, 60).map(unitRow)}</tbody></table></div>
            {rows.length > 60 && <p className="xs faint center" style={{ padding: 12 }}>Showing the 60 units closest to expiry out of {rows.length}. Search to narrow down.</p>}
          </>
        )}

        {tab === 'screen' && (
          <>
            <div style={{ padding: 16 }}><Notice tone="info">Units stay locked here until screening for HIV, hepatitis B and C, syphilis and malaria is clear. They cannot be allocated to a patient before release.</Notice></div>
            {quarantine.map((u) => (
              <div className="list-row" key={u.id}><GroupTag g={u.group} /><div className="grow"><b className="num">{u.id}</b><div className="xs muted">{COMPONENTS[u.component].short} · {u.source} · collected {fmtDate(u.collected)}</div></div>
                <button className="btn sm" onClick={() => { act.discard(u.id, 'Screening reactive', persona.name); toast(`${u.id} discarded`); }}>Reactive</button>
                <button className="btn sm primary" onClick={() => { act.releaseQuarantine([u.id], persona.name); toast(`${u.id} released to shelf`); }}><ShieldCheck size={14} /> Clear</button>
              </div>
            ))}
            {!quarantine.length && <Empty icon={<ShieldCheck size={26} />} title="Nothing waiting for screening" />}
          </>
        )}

        {tab === 'expiring' && (
          <>
            <div style={{ padding: 16 }}><Notice tone="warn">These units are allocated first. If you will not use them in time, transfer them to a centre that needs them instead of losing them.</Notice></div>
            <div className="table-wrap"><table className="table">{head}<tbody>{expiring.map(unitRow)}</tbody></table></div>
            {!expiring.length && <Empty title="Nothing expiring soon" />}
          </>
        )}
      </div>

      {discard && (
        <Modal title={`Discard ${discard}?`} sub="This goes into the discard register, with your name and the time." onClose={() => setDiscard(null)}>
          <div className="stack">
            <div className="stack s">{['Expired', 'Screening reactive', 'Bag leak or damage', 'Cold chain failure'].map((r) => <button key={r} className={`choice ${reason === r ? 'on' : ''}`} onClick={() => setReason(r)}><span className="tick" /><span>{r}</span></button>)}</div>
            <button className="btn primary block" onClick={() => { act.discard(discard, reason, persona.name); setDiscard(null); toast('Unit recorded as discarded'); }}><AlertTriangle size={15} /> Discard unit</button>
          </div>
        </Modal>
      )}
      {transfer && (
        <Modal title={`Transfer ${transfer}`} sub="Moves the unit to another centre so it is not wasted. Follow your FDA and SBTC transfer rules." onClose={() => setTransfer(null)}>
          <div className="stack">
            <Field label="To centre"><select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>{others.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.city})</option>)}</select></Field>
            <button className="btn primary block" onClick={() => { act.transfer(transfer, target, persona.name); setTransfer(null); toast('Unit transferred'); }}>Transfer unit</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ---------- donors ---------- */
export function BankDonors() {
  const { db, act } = useStore();
  const { me, persona } = useRole();
  const toast = useToast();
  const [tab, setTab] = useState<'booked' | 'past'>('booked');
  const [record, setRecord] = useState<string | null>(null);
  const [hb, setHb] = useState('13.5');
  const [alert, setAlert] = useState(false);
  const all = db.donations.filter((d) => d.bankId === me);
  const list = all.filter((d) => (tab === 'booked' ? d.status === 'booked' : d.status === 'completed' || d.status === 'deferred'));
  const low = Number(hb) < MIN_HB;
  const target = db.donations.find((d) => d.id === record);
  return (
    <>
      <PageHead title="Donors" sub="Walk-in and online donors in one list. Recording a donation adds the credit and sends the units to screening.">
        <button className="btn" onClick={() => setAlert(true)}><Megaphone size={16} /> Alert donors</button>
      </PageHead>
      <div className="card">
        <div style={{ padding: '4px 12px 0' }}><Tabs value={tab} onChange={setTab} items={[{ k: 'booked', label: 'Booked', n: all.filter((d) => d.status === 'booked').length }, { k: 'past', label: 'Past donations' }]} /></div>
        {list.map((d) => (
          <div className="list-row" key={d.id}>
            <GroupTag g={d.group} />
            <div className="grow"><b>{d.donorName}</b>{d.campId && <Badge>Camp</Badge>}<div className="xs muted">{fmtDate(d.date)} · {d.slot}{d.hb ? ` · Hb ${d.hb} g/dL` : ''}{d.note ? ` · ${d.note}` : ''}</div></div>
            {d.status === 'booked'
              ? <button className="btn sm primary" onClick={() => { setRecord(d.id); setHb('13.5'); }}><Syringe size={14} /> Record</button>
              : <Badge tone={d.status === 'completed' ? 'good' : 'warn'}>{d.status === 'completed' ? 'Donated' : 'Deferred'}</Badge>}
          </div>
        ))}
        {!list.length && <Empty icon={<Syringe size={26} />} title="No donors here yet" />}
      </div>
      {target && (
        <Modal title={`Record ${target.donorName}`} sub={`Group ${gl(target.group)}. Confirm the pre-donation check.`} onClose={() => setRecord(null)}>
          <div className="stack">
            <Field label="Haemoglobin (g/dL)" help={`Minimum ${MIN_HB} g/dL to donate`}><input className="input" inputMode="decimal" value={hb} onChange={(e) => setHb(e.target.value)} /></Field>
            {low ? <Notice tone="warn">Below the minimum. This will be recorded as a deferral, and no unit or credit will be created.</Notice> : <Notice tone="good">Creates units in screening and adds 1 credit to the donor’s wallet.</Notice>}
            <button className="btn primary block" disabled={!Number(hb)} onClick={() => { act.recordDonation(target.id, Number(hb), persona.name); setRecord(null); toast(low ? 'Deferral recorded' : 'Donation recorded. Credit added to the donor.'); }}>{low ? 'Record deferral' : 'Record donation'}</button>
          </div>
        </Modal>
      )}
      {alert && <BroadcastModal initial="O-" from={me} onClose={() => setAlert(false)} />}
    </>
  );
}
