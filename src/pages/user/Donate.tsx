import { useState } from 'react';
import { Check, ClipboardCheck, HandHeart, MapPin, X } from 'lucide-react';
import { daysUntilEligible, DONATION_GAP, fmtDate, MIN_HB, nextEligibleDate } from '../../data/rules';
import { useRole } from '../../layouts/Shell';
import { useStore } from '../../store/store';
import { Badge, Empty, Field, gl, Modal, Notice, PageHead, useToast } from '../../ui/kit';

const QUESTIONS = [
  'Are you between 18 and 65 years old?',
  'Do you weigh at least 45 kg?',
  'Are you feeling well today, with no fever or cold?',
  'No tattoo, piercing or major surgery in the last 12 months?',
  'Not pregnant, and not breastfeeding a young baby?',
  'No antibiotics in the last 7 days?',
];
const SLOTS = ['9:30 am', '10:30 am', '11:30 am', '12:30 pm', '3:00 pm', '4:30 pm', '6:00 pm'];
const inDays = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

export function Donate() {
  const { db, act } = useStore();
  const toast = useToast();
  const p = db.profile;
  const wait = daysUntilEligible(p);
  const next = nextEligibleDate(p);
  const [quiz, setQuiz] = useState(false);
  const [answers, setAnswers] = useState<Record<number, boolean>>({});
  const [passed, setPassed] = useState(false);
  const { me } = useRole();
  const [bankId, setBankId] = useState(() => db.banks.find((b) => b.verified)?.id ?? '');
  const [date, setDate] = useState(inDays(1));
  const [slot, setSlot] = useState('10:30 am');
  const mine = db.donations.filter((d) => d.donorId === me);
  const booked = mine.filter((d) => d.status === 'booked');
  const allYes = QUESTIONS.every((_, i) => answers[i] === true);
  const anyNo = Object.values(answers).some((v) => v === false);
  // Centres short of the donor's own group appear first, because that is where a donation helps most.
  const banks = db.banks.filter((b) => b.verified).map((b) => ({ b, n: db.batches.filter((u) => u.bankId === b.id && u.group === p.group && u.component === 'PRBC' && u.status === 'available').length })).sort((x, y) => x.b.km - y.b.km);

  return (
    <>
      <PageHead title="Donate blood" sub="Pick any centre in the network at a time that suits you. Your credit is valid everywhere." />
      <div className="grid g-main">
        <div className="stack">
          {wait > 0 && <Notice tone="info">You donated recently. For your safety the next donation opens on <b>{next ? fmtDate(next) : ''}</b> ({DONATION_GAP[p.sex]}-day gap).</Notice>}
          <section className="card pad stack" style={{ opacity: wait > 0 ? 0.6 : 1 }}>
            <div className="row between">
              <h3 style={{ fontSize: 18 }}>1. Quick health check</h3>
              {passed ? <Badge tone="good"><Check size={12} /> Looks good</Badge> : <Badge>2 minutes</Badge>}
            </div>
            <p className="small muted">This is a first check only. Staff at the centre confirm with a short exam and a haemoglobin test (at least {MIN_HB} g/dL).</p>
            <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={wait > 0} onClick={() => setQuiz(true)}><ClipboardCheck size={16} /> {passed ? 'Check again' : 'Start the check'}</button>
          </section>

          <section className="card pad stack" style={{ opacity: passed && wait === 0 ? 1 : 0.6 }}>
            <h3 style={{ fontSize: 18 }}>2. Choose a centre and time</h3>
            <div className="stack s">
              {banks.slice(0, 5).map(({ b, n }) => (
                <button key={b.id} className={`choice ${bankId === b.id ? 'on' : ''}`} onClick={() => setBankId(b.id)} aria-pressed={bankId === b.id} disabled={!passed || wait > 0}>
                  <span className="tick" />
                  <span className="grow"><b>{b.name}</b><span className="xs muted row" style={{ gap: 4, marginTop: 2 }}><MapPin size={12} />{b.city}, {b.km} km</span></span>
                  {n < 8 ? <Badge tone="warn">Low on {gl(p.group)}</Badge> : <Badge>{n} on shelf</Badge>}
                </button>
              ))}
            </div>
            <div className="grid g2">
              <Field label="Date"><input className="input" type="date" min={inDays(0)} value={date} disabled={!passed || wait > 0} onChange={(e) => setDate(e.target.value)} /></Field>
              <div className="field"><span className="label">Time</span><div className="chips">{SLOTS.map((s) => <button key={s} className={`chip ${slot === s ? 'on' : ''}`} disabled={!passed || wait > 0} onClick={() => setSlot(s)}>{s}</button>)}</div></div>
            </div>
            <button className="btn primary" disabled={!passed || wait > 0} onClick={() => { act.bookDonation(bankId, new Date(date).toISOString(), slot); setPassed(false); toast('Slot booked. See you there!'); }}><HandHeart size={17} /> Book my slot</button>
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-head"><h3>Your bookings</h3></div>
            {booked.map((d) => (
              <div className="list-row" key={d.id}>
                <div className="grow"><div className="strong" style={{ fontSize: 14 }}>{db.banks.find((b) => b.id === d.bankId)?.name}</div><div className="xs muted">{fmtDate(d.date)} · {d.slot}</div></div>
                <button className="btn sm icon quiet" aria-label="Cancel booking" onClick={() => { act.cancelDonation(d.id); toast('Booking cancelled'); }}><X size={16} /></button>
              </div>
            ))}
            {!booked.length && <Empty title="No bookings yet" />}
          </section>
          <section className="card pad stack s">
            <h3 style={{ fontSize: 16 }}>On the day</h3>
            <div className="small muted stack s">
              <div className="row top"><Check size={15} color="var(--good)" />Eat a proper meal and drink water beforehand.</div>
              <div className="row top"><Check size={15} color="var(--good)" />Bring a photo ID and your donor card.</div>
              <div className="row top"><Check size={15} color="var(--good)" />Plan for about 45 minutes, including rest.</div>
              <div className="row top"><Check size={15} color="var(--good)" />Your credit appears once the centre records the donation.</div>
            </div>
          </section>
          <Notice tone="info">Donating is voluntary and unpaid. Credits recognise your gift. They are not a payment.</Notice>
        </div>
      </div>

      {quiz && (
        <Modal title="Quick health check" sub="Answer honestly. It protects you and the patient." onClose={() => setQuiz(false)} wide>
          <div className="stack">
            {QUESTIONS.map((q, i) => (
              <div className="row between wrap" key={q} style={{ paddingBottom: 10, borderBottom: '1px solid var(--line)' }}>
                <span className="grow" style={{ minWidth: 220 }}>{q}</span>
                <div className="row" style={{ gap: 6 }}>
                  <button className={`chip ${answers[i] === true ? 'on' : ''}`} aria-pressed={answers[i] === true} onClick={() => setAnswers({ ...answers, [i]: true })}>Yes</button>
                  <button className={`chip ${answers[i] === false ? 'on' : ''}`} aria-pressed={answers[i] === false} onClick={() => setAnswers({ ...answers, [i]: false })}>No</button>
                </div>
              </div>
            ))}
            {anyNo && <Notice tone="warn">Thank you for being honest. You may need to wait before donating. Please speak to the centre’s medical officer, who can advise you.</Notice>}
            <button className="btn primary block" disabled={!allYes} onClick={() => { setPassed(true); setQuiz(false); toast('You look good to donate'); }}>Continue</button>
          </div>
        </Modal>
      )}
    </>
  );
}
