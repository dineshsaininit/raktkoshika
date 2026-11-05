import { useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowDownLeft, ArrowUpRight, Ban, Banknote, Check, CreditCard, Gift, HandHeart, Landmark, Lock, Plus, ReceiptIndianRupee, Smartphone, Undo2 } from 'lucide-react';
import { fmtDT, inr } from '../../data/rules';
import type { LedgerKind } from '../../data/types';
import { useStore } from '../../store/store';
import { useRole } from '../../layouts/Shell';
import { Badge, Empty, Field, Modal, Notice, PageHead, Tabs, useToast } from '../../ui/kit';

const META: Record<LedgerKind, { label: string; tone?: 'good' | 'info' | 'warn'; in?: boolean }> = {
  topup: { label: 'Added', tone: 'good', in: true }, hold: { label: 'Held', tone: 'info' }, capture: { label: 'Charged' }, release: { label: 'Released', tone: 'good', in: true }, refund: { label: 'Refunded', tone: 'good', in: true },
  credit_earn: { label: 'Credit earned', tone: 'good', in: true }, credit_hold: { label: 'Credit reserved', tone: 'info' }, credit_use: { label: 'Credit used' }, credit_release: { label: 'Credit returned', tone: 'good', in: true }, credit_gift: { label: 'Family credit', tone: 'info' }, settlement: { label: 'Settlement' },
};
const METHODS = [{ k: 'UPI', i: Smartphone, d: 'Instant, no charge' }, { k: 'Debit card', i: CreditCard, d: 'All major banks' }, { k: 'Net banking', i: Landmark, d: 'For larger amounts' }];

export function WalletPage() {
  const { db, act } = useStore();
  const { role, me, persona } = useRole();
  const toast = useToast();
  const w = db.wallets[me] ?? { balance: 0, held: 0, credits: 0, creditsHeld: 0, ledger: [] };
  const [modal, setModal] = useState<'add' | 'gift' | 'out' | null>(null);
  const [amount, setAmount] = useState(1000);
  const [method, setMethod] = useState('UPI');
  const [filter, setFilter] = useState<'all' | 'money' | 'credits'>('all');
  const [member, setMember] = useState('');
  const isCentre = role === 'bank' || role === 'franchise' || role === 'admin';
  const hasCredits = role === 'user' || role === 'referral';
  const rows = w.ledger.filter((l) => filter === 'all' || (filter === 'credits' ? l.kind.startsWith('credit') : !l.kind.startsWith('credit')));

  return (
    <>
      <PageHead title={role === 'referral' ? 'Hospital wallet' : 'Wallet'} sub={isCentre ? 'Money from settled orders, ready to pay out to your bank account.' : 'Pay processing charges from here. Your donor credits live here too.'} />
      <div className="grid g-main">
        <div className="stack">
          <section className="wallet-card" aria-label="Wallet balance">
            <div className="row between top">
              <div><div className="lab">Available balance</div><div className="amt">{inr(w.balance)}</div></div>
              <span className="badge" style={{ background: 'rgba(255,255,255,.12)', color: '#fff' }}><Lock size={11} /> Secured</span>
            </div>
            <div className="row wrap" style={{ marginTop: 18, gap: 10 }}>
              {!isCentre && <div className="pocket"><b>{inr(w.held)}</b><span>Held for open requests</span></div>}
              {hasCredits && <div className="pocket"><b>{w.credits} credit{w.credits === 1 ? '' : 's'}</b><span>{w.creditsHeld ? `${w.creditsHeld} more reserved` : 'Valid at any centre'}</span></div>}
              {isCentre && <div className="pocket"><b>Daily</b><span>Automatic payout cycle</span></div>}
            </div>
            <div className="row wrap" style={{ marginTop: 18 }}>
              {!isCentre && <button className="btn primary" onClick={() => setModal('add')}><Plus size={16} /> Add money</button>}
              {!isCentre && <button className="btn" onClick={() => setModal('out')} disabled={w.balance <= 0}><Undo2 size={16} /> Refund to bank</button>}
              {isCentre && <button className="btn primary" onClick={() => setModal('out')} disabled={w.balance <= 0}><Banknote size={16} /> Pay out to bank</button>}
              {role === 'user' && <button className="btn" onClick={() => setModal('gift')} disabled={w.credits < 1}><Gift size={16} /> Reserve for family</button>}
            </div>
          </section>

          <div className="card">
            <div className="card-head"><h3>Activity</h3></div>
            <div style={{ padding: '0 12px' }}><Tabs value={filter} onChange={setFilter} items={[{ k: 'all', label: 'All' }, { k: 'money', label: 'Money' }, ...(hasCredits ? [{ k: 'credits' as const, label: 'Credits' }] : [])]} /></div>
            {rows.map((l) => {
              const m = META[l.kind];
              const positive = l.amount > 0 || l.credits > 0;
              return (
                <div className="list-row" key={l.id}>
                  <span className="avatar" style={{ background: positive ? 'var(--good-soft)' : 'var(--surface-3)', color: positive ? 'var(--good)' : 'var(--ink-2)' }}>
                    {l.kind.startsWith('credit') ? <HandHeart size={17} /> : positive ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}
                  </span>
                  <div className="grow"><div className="strong truncate" style={{ fontSize: 14 }}>{l.note}</div><div className="xs faint">{fmtDT(l.at)}</div></div>
                  <div className="right">
                    <div className="strong num" style={{ color: positive ? 'var(--good)' : 'var(--ink)' }}>{l.credits ? `${l.credits > 0 ? '+' : '−'}${Math.abs(l.credits)} credit` : l.amount ? `${l.amount > 0 ? '+' : ''}${inr(l.amount)}` : ''}</div>
                    <Badge tone={m.tone}>{m.label}</Badge>
                  </div>
                </div>
              );
            })}
            {!rows.length && <Empty icon={<ReceiptIndianRupee size={26} />} title="No activity yet" />}
          </div>
        </div>

        <div className="stack">
          {role === 'user' && (
            <div className="card pad stack">
              <div className="row between"><h3 style={{ fontSize: 16 }}>Donor card</h3><Badge tone="good"><HandHeart size={11} /> Active donor</Badge></div>
              <div className="row" style={{ gap: 16 }}>
                <div style={{ background: '#fff', padding: 8, borderRadius: 12, lineHeight: 0, border: '1px solid var(--line)' }}>
                  <QRCodeSVG value={`RAKTKOSHIKA-DEMO:${db.profile.id}`} size={92} fgColor="#16202E" />
                </div>
                <div className="grow small">
                  <div className="strong">{persona.name}</div>
                  <div className="muted">Group {db.profile.group} · {db.donations.filter((d) => d.donorId === me && d.status === 'completed').length} donations</div>
                  <div className="xs faint" style={{ marginTop: 6 }}>Centres scan this to record a donation against your credits, anywhere in the network.</div>
                </div>
              </div>
              <Link className="btn sm" to="../donate">Book a donation</Link>
            </div>
          )}
          {!isCentre && (
            <div className="card pad stack s">
              <h3 style={{ fontSize: 16 }}>How your wallet works</h3>
              <div className="row top small"><Check size={16} color="var(--good)" /><span><b>Held, not spent.</b> Money is set aside when you request, and charged only when units are issued.</span></div>
              <div className="row top small"><Check size={16} color="var(--good)" /><span><b>Full return.</b> Declined or cancelled before issue means it all comes back.</span></div>
              <div className="row top small"><Check size={16} color="var(--good)" /><span><b>One network.</b> Donate in Sangli, use your credit in Pune.</span></div>
              <div className="row top small"><Ban size={16} color="var(--crit)" /><span><b>Credits are not money.</b> They cannot be cashed, sold or sent to strangers. Paying for blood or donors is illegal in India.</span></div>
            </div>
          )}
          {isCentre && <Notice tone="info">Money reaches you when units are issued. Each payout appears in Accounts with the order number, ready for your auditor.</Notice>}
        </div>
      </div>

      {modal === 'add' && (
        <Modal title="Add money" sub="Sample payment screen for this demo." onClose={() => setModal(null)}>
          <div className="stack">
            <Field label="Amount"><input className="input" inputMode="numeric" value={amount || ''} onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, '')))} /></Field>
            <div className="chips">{[500, 1000, 2000, 5000].map((a) => <button key={a} className={`chip ${amount === a ? 'on' : ''}`} onClick={() => setAmount(a)}>{inr(a)}</button>)}</div>
            <div className="stack s">{METHODS.map((m) => <button key={m.k} className={`choice ${method === m.k ? 'on' : ''}`} onClick={() => setMethod(m.k)}><span className="tick" /><m.i size={19} /><span><b>{m.k}</b><span className="xs muted" style={{ display: 'block' }}>{m.d}</span></span></button>)}</div>
            <button className="btn primary block" disabled={amount < 1} onClick={() => { act.topUp(me, amount, method); setModal(null); toast(`${inr(amount)} added to your wallet`); }}>Add {inr(amount)}</button>
          </div>
        </Modal>
      )}
      {modal === 'out' && (
        <Modal title={isCentre ? 'Pay out to bank' : 'Refund to bank'} sub={`${inr(w.balance)} available`} onClose={() => setModal(null)}>
          <div className="stack">
            <div className="choice" style={{ alignItems: 'center' }}><Landmark size={20} /><span className="grow"><b>Account ending 4417</b><span className="xs muted" style={{ display: 'block' }}>Verified · usually arrives within a working day</span></span></div>
            <button className="btn primary block" onClick={() => { act.settle(me, w.balance); setModal(null); toast('Transfer started'); }}>Send {inr(w.balance)}</button>
          </div>
        </Modal>
      )}
      {modal === 'gift' && (
        <Modal title="Reserve a credit for family" sub="One credit moves to a family member you have added. It cannot go to anyone else." onClose={() => setModal(null)}>
          <div className="stack">
            <div className="stack s">{db.profile.family.map((f) => <button key={f.id} className={`choice ${member === f.name ? 'on' : ''}`} onClick={() => setMember(f.name)}><span className="tick" /><span><b>{f.name}</b><span className="xs muted" style={{ display: 'block' }}>{f.relation} · {f.group}</span></span></button>)}</div>
            <button className="btn primary block" disabled={!member} onClick={() => { act.giftCredit(me, member); setModal(null); toast(`Credit reserved for ${member}`); }}>Reserve 1 credit</button>
          </div>
        </Modal>
      )}
    </>
  );
}
