import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, ClipboardList, FileText, MessagesSquare, Plus, Printer, Truck, X } from 'lucide-react';
import { COMPONENTS, fmtDT, fmtShort, inr, stageIndex, stageLabel, STAGES } from '../../data/rules';
import type { Order } from '../../data/types';
import { useStore } from '../../store/store';
import { useRole } from '../../layouts/Shell';
import { Badge, Empty, Field, gl, GroupTag, Modal, Notice, PageHead, Tabs, useToast } from '../../ui/kit';

export const isOpen = (o: Order) => !['completed', 'rejected', 'cancelled'].includes(o.stage);

export function MiniTrack({ o }: { o: Order }) {
  const i = stageIndex(o.stage);
  return <div className="mini-track" role="img" aria-label={`Step ${i + 1} of ${STAGES.length}`}>{STAGES.map((s, k) => <i key={s.key} className={k <= i ? 'on' : ''} />)}</div>;
}
export function StageBadge({ o }: { o: Order }) {
  const tone = o.stage === 'completed' ? 'good' : o.stage === 'rejected' || o.stage === 'cancelled' ? undefined : 'info';
  return <Badge tone={tone}>{stageLabel(o.stage)}</Badge>;
}

export function OrderRow({ o, to }: { o: Order; to: string }) {
  const { db } = useStore();
  const bank = db.banks.find((b) => b.id === o.bankId);
  return (
    <Link to={to} className="list-row">
      <GroupTag g={o.group} />
      <div className="grow">
        <div className="row wrap" style={{ gap: 7 }}>
          <span className="strong">{o.patient.name}</span>
          {o.urgency === 'sos' && <Badge tone="crit">Emergency</Badge>}
          {o.kind === 'booking' && <Badge>Booked</Badge>}
        </div>
        <div className="small muted truncate">{o.units} × {COMPONENTS[o.component].short} · {bank?.name}</div>
        {o.scheduledFor && <div className="xs faint">For {fmtDT(o.scheduledFor)}</div>}
      </div>
      <div className="stack s hide-m" style={{ width: 150, alignItems: 'flex-end' }}><StageBadge o={o} />{isOpen(o) && <MiniTrack o={o} />}</div>
      <span className="show-m"><StageBadge o={o} /></span>
    </Link>
  );
}

export function OrdersPage() {
  const { db } = useStore();
  const { me, base, role } = useRole();
  const [tab, setTab] = useState<'open' | 'done' | 'all'>('open');
  const mine = db.orders.filter((o) => o.ownerId === me);
  const list = mine.filter((o) => (tab === 'all' ? true : tab === 'open' ? isOpen(o) : !isOpen(o)));
  return (
    <>
      <PageHead title={role === 'referral' ? 'Patient orders' : 'My orders'} sub="Orders, scheduled requests and booked blood bags in one place.">
        <Link className="btn primary" to={`${base}/order`}><Plus size={17} /> New order</Link>
      </PageHead>
      <div className="card">
        <div style={{ padding: '4px 12px 0' }}>
          <Tabs value={tab} onChange={setTab} items={[{ k: 'open', label: 'In progress', n: mine.filter(isOpen).length }, { k: 'done', label: 'Closed', n: mine.filter((o) => !isOpen(o)).length }, { k: 'all', label: 'All', n: mine.length }]} />
        </div>
        {list.map((o) => <OrderRow key={o.id} o={o} to={`${base}/orders/${o.id}`} />)}
        {!list.length && <Empty icon={<ClipboardList size={26} />} title="Nothing here yet"><Link className="btn sm" to={`${base}/order`}>Place an order</Link></Empty>}
      </div>
    </>
  );
}

export function OrderDetail() {
  const { id } = useParams();
  const { db, act } = useStore();
  const { me, base, persona } = useRole();
  const toast = useToast();
  const [cancel, setCancel] = useState(false);
  const [reaction, setReaction] = useState(false);
  const [text, setText] = useState('');
  const o = db.orders.find((x) => x.id === id && x.ownerId === me);
  if (!o) return <Empty title="We could not find that order"><Link className="btn sm" to={`${base}/orders`}>Back to orders</Link></Empty>;
  const bank = db.banks.find((b) => b.id === o.bankId)!;
  const closed = o.stage === 'rejected' || o.stage === 'cancelled';
  const at = stageIndex(o.stage);
  const cancellable = at >= 0 && at < stageIndex('issued');
  const eventAt = (k: string) => o.events.find((e) => e.stage === k)?.at;
  const closeEvent = o.events.find((e) => e.stage === o.stage);
  const unitsLeft = db.batches.filter((u) => u.orderId === o.id);

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto' }}>
      <Link to={`${base}/orders`} className="link" style={{ marginBottom: 12 }}><ArrowLeft size={15} /> All orders</Link>
      <PageHead title={o.id} sub={`${o.units} unit${o.units > 1 ? 's' : ''} of ${gl(o.group)} ${COMPONENTS[o.component].name.toLowerCase()} for ${o.patient.name}`}>
        {o.urgency === 'sos' && <Badge tone="crit">Emergency</Badge>}
        <StageBadge o={o} />
      </PageHead>

      {closed && <div style={{ marginBottom: 16 }}><Notice tone="warn"><b>{stageLabel(o.stage)}.</b> {closeEvent?.note} Any held money and credits are back in your wallet.</Notice></div>}
      {o.reaction && <div style={{ marginBottom: 16 }}><Notice tone="crit"><b>Reaction reported:</b> {o.reaction}. The blood centre and Raktkoshika have been alerted.</Notice></div>}

      <div className="grid g-main">
        <div className="card">
          <div className="card-head"><h3>Progress</h3><span className="xs faint">Updates here as the centre works</span></div>
          <div className="card-body">
            <ol className="track" aria-label="Order progress">
              {STAGES.map((s, i) => {
                const done = !closed && i < at || (o.stage === 'completed' && i === at);
                const now = !closed && i === at && o.stage !== 'completed';
                const when = eventAt(s.key);
                return (
                  <li key={s.key} className={done ? 'done' : now ? 'now' : ''} aria-current={now ? 'step' : undefined}>
                    <span className="node">{done ? <Check size={15} /> : now ? <i className="dot live" style={{ color: 'var(--brand)', width: 9, height: 9 }} /> : <span className="xs">{i + 1}</span>}</span>
                    <div>
                      <div className={done || now ? 'strong' : 'faint'}>{s.label}</div>
                      <div className="xs faint">{when ? fmtDT(when) : s.hint}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
            {unitsLeft.length > 0 && <div className="small muted" style={{ marginTop: 16 }}>Allocated units: <b className="num">{unitsLeft.map((u) => u.id).join(', ')}</b></div>}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head"><h3>Payment</h3>{o.payment.settled ? <Badge tone="good">Settled</Badge> : o.payment.method === 'wallet' ? <Badge tone="info">Held</Badge> : <Badge>At counter</Badge>}</div>
            <div className="card-body stack s">
              <div className="row between small"><span className="muted">{o.units} × {inr(o.payment.fee)} processing charge</span><span className="num">{inr(o.payment.total)}</span></div>
              {o.payment.creditsUsed > 0 && <div className="row between small"><span className="muted">{o.payment.creditsUsed} donor credit{o.payment.creditsUsed > 1 ? 's' : ''}</span><span className="num" style={{ color: 'var(--good)' }}>{inr(-o.payment.creditsUsed * o.payment.fee)}</span></div>}
              <hr className="divider" />
              <div className="row between"><b>{o.payment.method === 'wallet' ? 'From wallet' : 'At centre'}</b><b className="num">{inr(o.payment.cash)}</b></div>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Details</h3></div>
            <div className="card-body stack s small">
              <div className="row between top"><span className="muted">Blood centre</span><span className="right strong">{bank.name}</span></div>
              <div className="row between top"><span className="muted">Hospital</span><span className="right">{o.patient.hospital}{o.patient.ward !== 'Not specified' ? `, ${o.patient.ward}` : ''}</span></div>
              <div className="row between"><span className="muted">Doctor</span><span>{o.patient.doctor}</span></div>
              <div className="row between"><span className="muted">Handover</span><span className="row" style={{ gap: 5 }}>{o.fulfilment === 'delivery' && <Truck size={14} />}{o.fulfilment === 'delivery' ? 'Cold-chain rider' : 'Attendant collects'}</span></div>
              <div className="row between"><span className="muted">Prescription</span><span className="row" style={{ gap: 5 }}><FileText size={14} />{o.rx}</span></div>
              {o.scheduledFor && <div className="row between"><span className="muted">Needed on</span><span>{fmtDT(o.scheduledFor)}</span></div>}
              <div className="row between"><span className="muted">Placed</span><span>{fmtShort(o.events[0].at)}</span></div>
            </div>
          </div>
          <div className="stack s">
            <Link className="btn block" to={`${base}/chat`}><MessagesSquare size={16} /> Message the centre</Link>
            {o.payment.settled && <button className="btn block" onClick={() => window.print()}><Printer size={16} /> Print receipt</button>}
            {o.stage === 'completed' && !o.reaction && <button className="btn block" onClick={() => setReaction(true)}><AlertTriangle size={16} /> Report a transfusion reaction</button>}
            {cancellable && <button className="btn block danger" onClick={() => setCancel(true)}><X size={16} /> Cancel request</button>}
          </div>
        </div>
      </div>

      {cancel && (
        <Modal title="Cancel this request?" sub="Any reserved units go back to stock, and your money returns straight away." onClose={() => setCancel(false)}>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setCancel(false)}>Keep it</button>
            <button className="btn primary" onClick={() => { act.closeOrder(o.id, persona.org, 'cancelled', 'Cancelled by the requester.'); setCancel(false); toast('Request cancelled. Money returned to wallet.'); }}>Cancel request</button>
          </div>
        </Modal>
      )}
      {reaction && (
        <Modal title="Report a transfusion reaction" sub="This alerts the blood centre at once. The treating doctor should already be involved." onClose={() => setReaction(false)}>
          <div className="stack">
            <Field label="What happened?"><textarea className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: fever and chills 20 minutes after starting" /></Field>
            <button className="btn primary block" disabled={!text.trim()} onClick={() => { act.reportReaction(o.id, text.trim(), persona.name); setReaction(false); toast('Report sent to the blood centre'); }}>Send report</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
