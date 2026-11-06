import { useState } from 'react';
import { FileText } from 'lucide-react';
import { apiMode, openFile } from '../api/client';

/** Shows a prescription's name; when a real file was uploaded, opens it for the people allowed to see it. */
export function RxLink({ name, fileId }: { name: string; fileId?: string }) {
  const [err, setErr] = useState('');
  if (!apiMode || !fileId) return <span className="row" style={{ gap: 5 }}><FileText size={14} />{name}</span>;
  return (
    <span className="stack s" style={{ alignItems: 'flex-end', gap: 2 }}>
      <button className="link" onClick={() => { setErr(''); openFile(fileId).catch((e) => setErr(e instanceof Error ? e.message : 'Could not open the file')); }}>
        <FileText size={14} /> {name}
      </button>
      {err && <span className="xs" style={{ color: 'var(--crit)' }}>{err}</span>}
    </span>
  );
}
