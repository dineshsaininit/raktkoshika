import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Lock, Megaphone, MessagesSquare, Send } from 'lucide-react';
import { ago, fmtTime } from '../../data/rules';
import { useStore } from '../../store/store';
import { useRole } from '../../layouts/Shell';
import { Empty, Notice, PageHead } from '../../ui/kit';

const PAID_WORDS = /\b(pay|paid|paying|money|cash|rupees?|rs\.?|paise|price|sell|buy|paisa)\b|₹/i;

export function ChatPage() {
  const { db, act } = useStore();
  const { me } = useRole();
  const threads = db.threads.filter((t) => t.members.includes(me));
  const [openId, setOpenId] = useState<string | null>(null);
  const [desktopDefault] = useState(() => window.matchMedia('(min-width: 861px)').matches);
  const active = threads.find((t) => t.id === openId) ?? (desktopDefault ? threads[0] : undefined);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [active?.id, active?.messages.length]);
  const flagged = PAID_WORDS.test(text);

  const send = () => {
    if (!text.trim() || !active) return;
    act.send(active.id, me, text.trim());
    setText('');
  };

  return (
    <>
      <PageHead title="Chat" sub="Talk to centres, hospitals, donors and Raktkoshika. Phone numbers stay hidden unless you share them." />
      <div className={`card chat ${active ? 'has-open' : ''}`}>
        <div className="chat-list">
          {threads.map((t) => {
            const last = t.messages[t.messages.length - 1];
            return (
              <button key={t.id} className={`thread ${active?.id === t.id ? 'on' : ''}`} onClick={() => setOpenId(t.id)}>
                <span className="avatar brand">{t.kind === 'broadcast' ? <Megaphone size={16} /> : t.title.slice(0, 2).toUpperCase()}</span>
                <span className="grow">
                  <span className="row between"><span className="strong truncate" style={{ fontSize: 14 }}>{t.title}</span>{last && <span className="xs faint" style={{ flexShrink: 0 }}>{ago(last.at)}</span>}</span>
                  <span className="small muted truncate" style={{ display: 'block' }}>{last?.text ?? t.subtitle}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="chat-pane">
          {active ? (
            <>
              <div className="row" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
                <button className="btn icon sm quiet show-m" onClick={() => setOpenId(null)} aria-label="Back to conversations"><ArrowLeft size={18} /></button>
                <div className="grow"><div className="strong truncate">{active.title}</div><div className="xs faint truncate">{active.subtitle}</div></div>
                <span className="badge hide-m"><Lock size={11} /> Number hidden</span>
              </div>
              <div className="chat-msgs" aria-live="polite">
                {active.messages.map((m) => <div key={m.id} className={`msg ${m.from === me ? 'me' : ''}`}>{m.text}<time>{fmtTime(m.at)}</time></div>)}
                <div ref={end} />
              </div>
              {flagged && <div style={{ padding: '10px 14px 0' }}><Notice tone="warn">Reminder: paying or accepting money for a blood donation is illegal in India. Processing charges are paid only through the centre.</Notice></div>}
              <form className="row" style={{ padding: 12 }} onSubmit={(e) => { e.preventDefault(); send(); }}>
                <input className="input" placeholder="Write a message" aria-label="Message" value={text} onChange={(e) => setText(e.target.value)} />
                <button className="btn primary icon" aria-label="Send" disabled={!text.trim()}><Send size={17} /></button>
              </form>
            </>
          ) : <Empty icon={<MessagesSquare size={26} />} title="Pick a conversation" />}
        </div>
      </div>
    </>
  );
}
