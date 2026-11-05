import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertOctagon, ArrowLeft, ArrowRight, CalendarPlus, Check, FileUp, MapPin, Phone, Trash2, Truck, Wallet } from 'lucide-react';
import { compatibleDonors, COMPONENTS, COMPONENT_KEYS, fmtDT, inr, processingFee } from '../../data/rules';
import type { BloodGroup, Component } from '../../data/types';
import { useStore } from '../../store/store';
import { useRole } from '../../layouts/Shell';
import { Badge, Field, GroupPicker, gl, GroupTag, Modal, Notice, PageHead, useToast } from '../../ui/kit';

type Mode = 'now' | 'schedule' | 'book';
const MODES: { k: Mode; t: string; d: string }[] = [
  { k: 'now', t: 'Order now', d: 'For a transfusion today' },
  { k: 'schedule', t: 'Scheduled order', d: 'One or many dates, like regular transfusions' },
  { k: 'book', t: 'Book a blood bag', d: 'Reserve units ahead of a planned surgery' },
];
const STEP_NAMES = ['What is needed', 'Patient & prescription', 'Blood centre', 'Review & pay'];

const defaultWhen = (d = 1) => { const x = new Date(Date.now() + d * 864e5); x.setHours(10, 0, 0, 0); return new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };

export function NewOrder() {
  const { db, act } = useStore();
  const { role, me, base, persona } = useRole();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const sos = params.get('mode') === 'sos';
  const wallet = db.wallets[me] ?? { balance: 0, credits: 0 };
  const hospitalDefault = role === 'referral' ? 'Sanjeevani Hospital, Miraj' : '';

  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<Mode>((params.get('mode') as Mode) === 'schedule' ? 'schedule' : (params.get('mode') as Mode) === 'book' ? 'book' : 'now');
  const [group, setGroup] = useState<BloodGroup>((params.get('group') as BloodGroup) || 'O+');
  const [comp, setComp] = useState<Component>((params.get('component') as Component) || 'PRBC');
  const [units, setUnits] = useState(1);
  const [dates, setDates] = useState<string[]>([defaultWhen()]);
  const [patient, setPatient] = useState({ name: '', age: '', hospital: hospitalDefault, ward: '', doctor: role === 'referral' ? persona.name : '' });
  const [rx, setRx] = useState('');
  const [bankId, setBankId] = useState(params.get('bank') ?? '');
  const [fulfilment, setFulfilment] = useState<'collect' | 'delivery'>('collect');
  const [method, setMethod] = useState<'wallet' | 'counter'>('wallet');
  const [credits, setCredits] = useState(0);
  const [topUp, setTopUp] = useState(false);

  const count = (id: string) => db.batches.filter((u) => u.bankId === id && u.status === 'available' && u.group === group && u.component === comp).length;
  const centres = useMemo(() => db.banks.filter((b) => b.verified).map((b) => ({ b, n: count(b.id) })).sort((x, y) => Number(y.n >= units) - Number(x.n >= units) || x.b.km - y.b.km), [db.batches, db.banks, group, comp, units]); // eslint-disable-line
  const bestBank = centres.find((c) => c.n >= units)?.b;
  const bank = db.banks.find((b) => b.id === bankId) ?? bestBank;
  const fee = bank ? processingFee(comp, bank) : 0;
  const multi = mode === 'schedule' ? dates.length : 1;
  const maxCredits = Math.min(wallet.credits, units * multi);
  const creditsApplied = Math.min(credits, maxCredits);
  const total = fee * units * multi;
  const toPay = total - creditsApplied * fee;
  const short = method === 'wallet' && toPay > wallet.balance;
  const stepOk = [
    true,
    patient.name.trim() && patient.hospital.trim() && patient.doctor.trim() && rx,
    !!bank,
    !short,
  ];

  const submit = () => {
    if (!bank) return;
    let left = creditsApplied;
    const whens = mode === 'now' ? [undefined] : mode === 'book' ? [dates[0]] : dates;
    const ids = whens.map((when) => {
      const use = Math.min(left, units); left -= use;
      return act.placeOrder({
        ownerId: me, actor: persona.org, kind: mode === 'book' ? 'booking' : 'order', urgency: sos ? 'sos' : 'routine',
        patient: { name: patient.name, age: Number(patient.age) || 0, hospital: patient.hospital, ward: patient.ward || 'Not specified', doctor: patient.doctor },
        group, component: comp, units, bankId: bank.id, scheduledFor: when ? new Date(when).toISOString() : undefined,
        fulfilment, rx, method, creditsToUse: use,
      });
    });
    toast(ids.length > 1 ? `${ids.length} scheduled orders placed` : `Request ${ids[0]} sent to ${bank.name}`);
    navigate(ids.length > 1 ? `${base}/orders` : `${base}/orders/${ids[0]}`);
  };

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <PageHead title={sos ? 'Emergency blood request' : role === 'referral' ? 'Order for a patient' : 'Order blood'} sub={sos ? 'Goes to the top of the blood centre’s queue. You can pay at the counter, so money never holds up an emergency.' : 'Takes about two minutes. You pay only the government-set processing charge.'}>
        {!sos && <a className="btn" href="tel:+919000010000"><Phone size={16} /> Call Raktkoshika</a>}
      </PageHead>
      {sos && <div style={{ marginBottom: 16 }}><Notice tone="crit"><b>Keep the patient in hospital care.</b> Blood needs a cross-match with the patient’s sample before it can be given. Our helpline can stay on call with you: <a href="tel:+919000010000" style={{ fontWeight: 700 }}>+91 90000 10000</a>.</Notice></div>}

      <ol className="row" style={{ gap: 6, marginBottom: 18 }} aria-label="Steps">
        {STEP_NAMES.map((n, i) => (
          <li key={n} className="grow">
            <div style={{ height: 5, borderRadius: 3, background: i <= step ? 'var(--brand-fill)' : 'var(--line-2)', transition: 'background .25s' }} />
            <div className={`xs hide-m ${i === step ? 'strong' : 'faint'}`} style={{ marginTop: 6 }}>{n}</div>
          </li>
        ))}
      </ol>

      <div className="card pad stack l">
        {step === 0 && (
          <>
            {!sos && <div className="grid g3" style={{ gap: 10 }}>{MODES.map((m) => <button key={m.k} className={`choice ${mode === m.k ? 'on' : ''}`} onClick={() => setMode(m.k)} aria-pressed={mode === m.k}><span className="tick" /><span><b>{m.t}</b><span className="xs muted" style={{ display: 'block' }}>{m.d}</span></span></button>)}</div>}
            <div className="field"><span className="label">Patient’s blood group</span><GroupPicker value={group} onChange={setGroup} /></div>
            <div className="field">
              <span className="label">Component prescribed</span>
              <div className="grid g2" style={{ gap: 10 }}>{COMPONENT_KEYS.map((c) => (
                <button key={c} className={`choice ${comp === c ? 'on' : ''}`} onClick={() => setComp(c)} aria-pressed={comp === c}><span className="tick" /><span><b>{COMPONENTS[c].name}</b><span className="xs muted" style={{ display: 'block' }}>{COMPONENTS[c].desc}</span></span></button>
              ))}</div>
            </div>
            <div className="field">
              <span className="label">Units {mode === 'schedule' ? 'on each date' : ''}</span>
              <div className="stepper" style={{ alignSelf: 'flex-start' }}><button onClick={() => setUnits(Math.max(1, units - 1))} aria-label="Fewer units">−</button><b aria-live="polite">{units}</b><button onClick={() => setUnits(Math.min(8, units + 1))} aria-label="More units">+</button></div>
            </div>
            {mode !== 'now' && (
              <div className="field">
                <span className="label">{mode === 'book' ? 'Reserve for' : 'Dates and times'}</span>
                <div className="stack s">
                  {(mode === 'book' ? dates.slice(0, 1) : dates).map((d, i) => (
                    <div className="row" key={i}>
                      <input type="datetime-local" className="input" aria-label={`Date ${i + 1}`} value={d} onChange={(e) => setDates(dates.map((x, k) => (k === i ? e.target.value : x)))} />
                      {mode === 'schedule' && dates.length > 1 && <button className="btn icon quiet" aria-label="Remove date" onClick={() => setDates(dates.filter((_, k) => k !== i))}><Trash2 size={16} /></button>}
                    </div>
                  ))}
                  {mode === 'schedule' && <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setDates([...dates, defaultWhen(dates.length * 21 + 1)])}><CalendarPlus size={15} /> Add another date</button>}
                </div>
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <>
            {role === 'user' && db.profile.family.length > 0 && (
              <div className="field"><span className="label">Quick fill from family</span><div className="chips">{db.profile.family.map((f) => <button key={f.id} className="chip" onClick={() => { setPatient({ ...patient, name: f.name }); setGroup(f.group); }}>{f.name}</button>)}</div></div>
            )}
            <div className="grid g2">
              <Field label="Patient’s name"><input className="input" value={patient.name} onChange={(e) => setPatient({ ...patient, name: e.target.value })} /></Field>
              <Field label="Age"><input className="input" inputMode="numeric" value={patient.age} onChange={(e) => setPatient({ ...patient, age: e.target.value.replace(/\D/g, '') })} /></Field>
              <Field label="Hospital"><input className="input" value={patient.hospital} onChange={(e) => setPatient({ ...patient, hospital: e.target.value })} /></Field>
              <Field label="Ward or bed (optional)"><input className="input" value={patient.ward} onChange={(e) => setPatient({ ...patient, ward: e.target.value })} /></Field>
              <Field label="Treating doctor"><input className="input" value={patient.doctor} onChange={(e) => setPatient({ ...patient, doctor: e.target.value })} /></Field>
            </div>
            <div className="field">
              <span className="label">Doctor’s prescription or blood request form</span>
              <label className="choice" style={{ cursor: 'pointer', borderStyle: rx ? 'solid' : 'dashed', alignItems: 'center' }}>
                {rx ? <Check size={20} color="var(--good)" /> : <FileUp size={20} className="brand-text" />}
                <span className="grow"><b>{rx || 'Upload a photo or PDF'}</b><span className="xs muted" style={{ display: 'block' }}>Centres cannot issue blood without it.</span></span>
                <input type="file" accept="image/*,.pdf" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} onChange={(e) => setRx(e.target.files?.[0]?.name ?? '')} />
              </label>
              <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setRx('sample-prescription.pdf')}>Use a sample file for this demo</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="stack s">
              {centres.map(({ b, n }) => {
                const enough = n >= units;
                const on = bank?.id === b.id;
                return (
                  <button key={b.id} disabled={!enough} className={`choice ${on ? 'on' : ''}`} style={{ opacity: enough ? 1 : 0.55, cursor: enough ? 'pointer' : 'not-allowed' }} onClick={() => setBankId(b.id)} aria-pressed={on}>
                    <span className="tick" />
                    <span className="grow">
                      <b>{b.name}</b>
                      <span className="xs muted row wrap" style={{ gap: 10, marginTop: 2 }}><span className="row" style={{ gap: 3 }}><MapPin size={12} />{b.city}, {b.km} km</span><span>{inr(processingFee(comp, b))} per unit</span><span>{b.type}</span></span>
                    </span>
                    <span className="center"><b style={{ font: '800 20px var(--display)' }}>{n}</b><span className="xs faint" style={{ display: 'block' }}>{enough ? 'in stock' : 'not enough'}</span></span>
                  </button>
                );
              })}
            </div>
            {!bestBank && <Notice tone="warn"><b>No centre has {units} × {gl(group)} right now.</b> Try fewer units, or post a donor request. Compatible groups to ask the doctor about: {compatibleDonors(group, comp).filter((g) => g !== group).map(gl).join(', ') || 'none'}.</Notice>}
            <div className="field">
              <span className="label">How units reach the patient</span>
              <div className="grid g2" style={{ gap: 10 }}>
                <button className={`choice ${fulfilment === 'collect' ? 'on' : ''}`} onClick={() => setFulfilment('collect')}><span className="tick" /><span><b>Hospital attendant collects</b><span className="xs muted" style={{ display: 'block' }}>Bring the patient’s sample and a cold box.</span></span></button>
                <button className={`choice ${fulfilment === 'delivery' ? 'on' : ''}`} onClick={() => setFulfilment('delivery')}><span className="tick" /><span><b className="row" style={{ gap: 6 }}><Truck size={15} /> Cold-chain rider</b><span className="xs muted" style={{ display: 'block' }}>Delivered only to a hospital, in a validated box.</span></span></button>
              </div>
            </div>
          </>
        )}

        {step === 3 && bank && (
          <>
            <div className="row top" style={{ gap: 14 }}>
              <GroupTag g={group} size="lg" solid />
              <div className="grow">
                <h3 style={{ fontSize: 19 }}>{units * multi} unit{units * multi > 1 ? 's' : ''} of {COMPONENTS[comp].name.toLowerCase()}</h3>
                <div className="small muted">{patient.name} · {patient.hospital}</div>
                <div className="small muted">{bank.name}, {bank.city}</div>
                {mode !== 'now' && <div className="small muted">{(mode === 'book' ? dates.slice(0, 1) : dates).map((d) => fmtDT(d)).join(' · ')}</div>}
              </div>
              {sos && <Badge tone="crit">Emergency</Badge>}
            </div>
            <hr className="divider" />
            <div className="field">
              <span className="label">Pay with</span>
              <div className="grid g2" style={{ gap: 10 }}>
                <button className={`choice ${method === 'wallet' ? 'on' : ''}`} onClick={() => setMethod('wallet')}><span className="tick" /><span><b>Raktkoshika wallet</b><span className="xs muted" style={{ display: 'block' }}>{inr(wallet.balance)} available. Held now, charged at issue.</span></span></button>
                <button className={`choice ${method === 'counter' ? 'on' : ''}`} onClick={() => setMethod('counter')}><span className="tick" /><span><b>Pay at the centre</b><span className="xs muted" style={{ display: 'block' }}>Cash or UPI when units are issued.</span></span></button>
              </div>
            </div>
            {wallet.credits > 0 && (
              <div className="row between wrap" style={{ padding: '12px 14px', background: 'var(--brand-soft)', borderRadius: 13 }}>
                <div className="grow" style={{ minWidth: 200 }}><b>Use donor credits</b><div className="xs muted">You have {wallet.credits}. Each one covers the processing charge on one unit.</div></div>
                <div className="stepper"><button onClick={() => setCredits(Math.max(0, creditsApplied - 1))} aria-label="Fewer credits">−</button><b>{creditsApplied}</b><button onClick={() => setCredits(Math.min(maxCredits, creditsApplied + 1))} aria-label="More credits">+</button></div>
              </div>
            )}
            <div className="stack s">
              <div className="row between small"><span className="muted">Processing charge ({units * multi} × {inr(fee)})</span><span className="num">{inr(total)}</span></div>
              {creditsApplied > 0 && <div className="row between small"><span className="muted">Donor credits ({creditsApplied})</span><span className="num" style={{ color: 'var(--good)' }}>{inr(-creditsApplied * fee)}</span></div>}
              <div className="row between small"><span className="muted">Platform fee on blood</span><span className="num">₹0</span></div>
              <hr className="divider" />
              <div className="row between"><b>{method === 'wallet' ? 'To hold from wallet' : 'To pay at the centre'}</b><b className="num" style={{ font: '800 24px var(--display)' }}>{inr(toPay)}</b></div>
            </div>
            {short && (
              <Notice tone="warn">
                <div className="row between wrap"><span>You need {inr(toPay - wallet.balance)} more in your wallet.</span><button className="btn sm" onClick={() => setTopUp(true)}><Wallet size={14} /> Add money</button></div>
              </Notice>
            )}
            <p className="xs faint">If the request is declined or cancelled before issue, the held amount and any credits go back to your wallet immediately.</p>
          </>
        )}

        <div className="row between">
          {step > 0 ? <button className="btn" onClick={() => setStep(step - 1)}><ArrowLeft size={16} /> Back</button> : <span />}
          {step < 3
            ? <button className="btn primary" disabled={!stepOk[step]} onClick={() => { if (step === 1 && sos && bestBank && !bankId) setBankId(bestBank.id); setStep(step + 1); }}>Continue <ArrowRight size={16} /></button>
            : <button className="btn primary" disabled={!stepOk[3] || !bank} onClick={submit}>{sos ? <><AlertOctagon size={16} /> Send emergency request</> : 'Place request'}</button>}
        </div>
      </div>

      {topUp && (
        <Modal title="Add money" sub="Sample payment for this demo." onClose={() => setTopUp(false)}>
          <div className="stack">
            <p className="small muted">Adds {inr(Math.max(500, toPay - wallet.balance))} to your wallet by UPI.</p>
            <button className="btn primary block" onClick={() => { act.topUp(me, Math.max(500, toPay - wallet.balance), 'UPI'); setTopUp(false); toast('Money added'); }}>Add {inr(Math.max(500, toPay - wallet.balance))}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
