import { useEffect, useState } from 'react';
import { Minus, Package, Plus, Save } from 'lucide-react';
import { BAG_TYPES, CHARGE_TYPES, COMPONENTS, COMPONENT_KEYS, inr, processingFee } from '../../data/rules';
import type { BagType, Component } from '../../data/types';
import { useRole } from '../../layouts/Shell';
import { useStore } from '../../store/store';
import { Badge, Field, Notice, PageHead, Switch, useToast } from '../../ui/kit';

/** Blood centre: its own charges (standard, replacement, self-donor ELISA), booking rules, replacement times and bag stock. */
export function BankCharges() {
  const { db, act } = useStore();
  const { me } = useRole();
  const toast = useToast();
  const bank = db.banks.find((b) => b.id === me);
  const [fees, setFees] = useState<Partial<Record<Component, string>>>({});
  const [elisa, setElisa] = useState('');
  const [hold, setHold] = useState('24');
  const [slots, setSlots] = useState('');
  const [anyTime, setAnyTime] = useState(true);
  const [add, setAdd] = useState<Partial<Record<BagType, string>>>({});

  useEffect(() => {
    if (!bank) return;
    setFees(Object.fromEntries(COMPONENT_KEYS.map((c) => [c, String(bank.replacementFees?.[c] ?? '')])));
    setElisa(bank.elisaFee != null ? String(bank.elisaFee) : '');
    setHold(String(bank.holdHours ?? 24));
    setSlots((bank.replacementSlots ?? []).join(', '));
    setAnyTime(bank.bookings24x7 ?? true);
  }, [bank?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!bank) return <PageHead title="Charges & bags" />;
  const bags = BAG_TYPES.map((t) => ({ ...t, units: db.bags?.find((g) => g.bankId === bank.id && g.type === t.type)?.units ?? 0 }));
  const slotList = slots.split(',').map((s) => s.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean);
  const badSlot = slotList.find((s) => !/^\d{1,2}:\d{2} (am|pm)$/.test(s));
  const num = (v: string) => (v.trim() === '' ? undefined : Math.max(0, Math.round(Number(v))));

  const save = () => {
    if (badSlot) return;
    const replacementFees = Object.fromEntries(COMPONENT_KEYS.filter((c) => num(fees[c] ?? '') !== undefined).map((c) => [c, num(fees[c]!)!]));
    act.updateSettings(bank.id, { replacementFees, elisaFee: num(elisa), holdHours: Math.min(168, Math.max(1, num(hold) ?? 24)), replacementSlots: slotList, bookings24x7: anyTime });
    toast('Charges and booking rules saved');
  };

  return (
    <>
      <PageHead title="Charges & bags" sub={`What ${bank.name} charges for each way of paying, how bookings work, and the blood bags on your shelf.`}>
        <button className="btn primary" onClick={save} disabled={!!badSlot}><Save size={16} /> Save changes</button>
      </PageHead>

      <div className="grid g-main" style={{ marginBottom: 16 }}>
        <section className="card">
          <div className="card-head"><h3>Charges per unit</h3><span className="xs faint">Never above the standard processing charge</span></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Component</th><th className="r">{CHARGE_TYPES.standard.label}</th><th className="r">{CHARGE_TYPES.replacement.label}</th></tr></thead>
              <tbody>{COMPONENT_KEYS.map((c) => (
                <tr key={c}>
                  <td className="strong">{COMPONENTS[c].name}</td>
                  <td className="r num">{inr(processingFee(c, bank))}</td>
                  <td className="r" style={{ width: 170 }}><input className="input num" style={{ minHeight: 36, textAlign: 'right' }} inputMode="numeric" aria-label={`Replacement charge for ${COMPONENTS[c].name}`} placeholder={String(processingFee(c, bank))} value={fees[c] ?? ''} onChange={(e) => setFees({ ...fees, [c]: e.target.value.replace(/\D/g, '') })} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="card-body grid g2">
            <Field label="Self donor: ELISA test charge per unit" help="Charged when the family brings its own donor"><input className="input" inputMode="numeric" placeholder="Not offered" value={elisa} onChange={(e) => setElisa(e.target.value.replace(/\D/g, ''))} /></Field>
            <Field label="Bookings hold units for (hours)" help="After this, an uncollected booking ends and money is returned"><input className="input" inputMode="numeric" value={hold} onChange={(e) => setHold(e.target.value.replace(/\D/g, ''))} /></Field>
          </div>
        </section>

        <section className="card pad stack">
          <h3 style={{ fontSize: 16 }}>Booking rules</h3>
          <label className="row between"><span><b>Take bookings any time (24×7)</b><span className="xs muted" style={{ display: 'block' }}>Off means bookings only in working hours</span></span><Switch on={anyTime} onChange={setAnyTime} label="Bookings 24x7" /></label>
          <Field label="Fixed times for replacement donors" help="Separate with commas, like 9:30 am, 11:00 am, 4:00 pm">
            <input className="input" value={slots} onChange={(e) => setSlots(e.target.value)} />
          </Field>
          {badSlot && <Notice tone="warn">“{badSlot}” is not a time like 9:30 am.</Notice>}
          <div className="chips">{slotList.filter((s) => !badSlot || s !== badSlot).map((s) => <span key={s} className="badge info">{s}</span>)}</div>
          <Notice tone="info">Rates here are your centre’s own. The standard charge follows the government table, and replacement and ELISA charges are capped at it.</Notice>
        </section>
      </div>

      <section className="card">
        <div className="card-head"><h3>Blood bag stock</h3><span className="xs faint">Recording a donation uses one bag of the chosen type</span></div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, padding: 16 }}>
          {bags.map((g) => (
            <div key={g.type} className="card pad stack s" style={{ boxShadow: 'none' }}>
              <div className="row between"><b className="row" style={{ gap: 6 }}><Package size={16} className="brand-text" /> {g.type}</b>{g.units < 10 ? <Badge tone="warn">Low</Badge> : <Badge tone="good">OK</Badge>}</div>
              <div className="xs muted">{g.desc}</div>
              <div style={{ font: '800 30px var(--display)' }} className="num">{g.units}<span className="xs faint" style={{ fontWeight: 500 }}> units</span></div>
              <div className="row" style={{ gap: 6 }}>
                <input className="input" style={{ minHeight: 36 }} inputMode="numeric" placeholder="Qty" aria-label={`Quantity of ${g.type} bags`} value={add[g.type] ?? ''} onChange={(e) => setAdd({ ...add, [g.type]: e.target.value.replace(/\D/g, '') })} />
                <button className="btn sm icon" aria-label={`Add ${g.type} bags`} disabled={!Number(add[g.type])} onClick={() => { act.adjustBags(bank.id, g.type, Number(add[g.type])); setAdd({ ...add, [g.type]: '' }); toast(`${add[g.type]} ${g.type.toLowerCase()} bags added`); }}><Plus size={15} /></button>
                <button className="btn sm icon" aria-label={`Remove ${g.type} bags`} disabled={!Number(add[g.type]) || Number(add[g.type]) > g.units} onClick={() => { act.adjustBags(bank.id, g.type, -Number(add[g.type])); setAdd({ ...add, [g.type]: '' }); toast(`${add[g.type]} ${g.type.toLowerCase()} bags removed`); }}><Minus size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
