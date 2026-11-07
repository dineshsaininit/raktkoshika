import { useEffect, useState } from 'react';
import { CheckCircle2, Database, ExternalLink, FileUp, Loader2 } from 'lucide-react';
import { apiMode, directory, ERAKTKOSH_URL, type DirectoryMeta, type ImportResult } from '../../api/client';
import { fmtDate } from '../../data/rules';
import { Field, Notice, PageHead, Stat, useToast } from '../../ui/kit';
import { DirectoryBrowser } from '../shared/Directory';

const MAX = 12 * 1024 * 1024;

/** HQ: load and refresh the government list of licensed blood centres. */
export function GovDirectory() {
  const toast = useToast();
  const [meta, setMeta] = useState<DirectoryMeta | null>(null);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [source, setSource] = useState('');
  const [state, setState] = useState('');
  const [replace, setReplace] = useState<'source' | 'state'>('source');
  const [check, setCheck] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<'' | 'check' | 'import'>('');
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => { if (apiMode) directory.meta().then(setMeta).catch(() => {}); }, [version]);

  const pick = (f: File | undefined) => {
    setCheck(null); setError('');
    if (!f) return;
    if (f.size > MAX) { setError('The file is larger than 12 MB. Split it by state and import each part.'); return; }
    const r = new FileReader();
    r.onload = () => { setFile({ name: f.name, text: String(r.result) }); if (!source) setSource(f.name.replace(/\.(csv|json)$/i, '')); };
    r.onerror = () => setError('Could not read the file');
    r.readAsText(f);
  };
  const run = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(dryRun ? 'check' : 'import'); setError('');
    try {
      const r = await directory.import({ text: file.text, source: source.trim() || file.name, defaultState: state.trim() || undefined, replace, dryRun });
      if (dryRun) setCheck(r);
      else { toast(`${r.imported.toLocaleString('en-IN')} centres imported`); setCheck(null); setFile(null); setVersion((v) => v + 1); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally { setBusy(''); }
  };

  if (!apiMode) return <><PageHead title="Government directory" /><Notice tone="info">Importing needs the Raktkoshika server.</Notice></>;

  return (
    <>
      <PageHead title="Government directory" sub="The official list of licensed blood centres, from the National Health Portal and State Blood Transfusion Councils. Shown to the public and used for licence checks." />
      <div className="grid g3" style={{ marginBottom: 16 }}>
        <Stat icon={<Database size={15} />} label="Licensed centres listed" value={(meta?.total ?? 0).toLocaleString('en-IN')} />
        <Stat label="States and UTs" value={meta?.states ?? 0} />
        <Stat label="Last loaded" value={meta?.importedAt ? fmtDate(meta.importedAt) : 'Never'} sub={meta?.sources.map((s) => `${s.source}: ${s.n}`).join(' · ')} />
      </div>

      <div className="grid g-main" style={{ marginBottom: 22 }}>
        <section className="card pad stack">
          <h3 style={{ fontSize: 17 }}>Import a file</h3>
          <label className="choice" style={{ cursor: 'pointer', borderStyle: file ? 'solid' : 'dashed', alignItems: 'center', position: 'relative' }}>
            {file ? <CheckCircle2 size={20} color="var(--good)" /> : <FileUp size={20} className="brand-text" />}
            <span className="grow"><b>{file ? file.name : 'Choose a CSV or JSON file'}</b><span className="xs muted" style={{ display: 'block' }}>CSV with a header row, or data.gov.in API JSON. Up to 12 MB.</span></span>
            <input type="file" accept=".csv,.json,text/csv,application/json" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          <div className="grid g2">
            <Field label="Source label" help="Shown under search results"><input className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder="National Health Portal, Nov 2026" /></Field>
            <Field label="State (single-state files only)" help="For an SBTC list without a State column"><input className="input" value={state} onChange={(e) => setState(e.target.value)} placeholder="Maharashtra" /></Field>
          </div>
          <div className="field">
            <span className="label">When importing</span>
            <div className="grid g2" style={{ gap: 8 }}>
              <button type="button" className={`choice ${replace === 'source' ? 'on' : ''}`} onClick={() => setReplace('source')}><span className="tick" /><span><b>Replace this source</b><span className="xs muted" style={{ display: 'block' }}>Earlier rows with the same label are replaced</span></span></button>
              <button type="button" className={`choice ${replace === 'state' ? 'on' : ''}`} onClick={() => setReplace('state')}><span className="tick" /><span><b>Replace whole states</b><span className="xs muted" style={{ display: 'block' }}>For a newer SBTC list of a state</span></span></button>
            </div>
          </div>
          {error && <Notice tone="warn">{error}</Notice>}
          {check && (
            <Notice tone="good">
              <b>{check.total.toLocaleString('en-IN')} centres ready</b>{check.skipped ? `, ${check.skipped} rows skipped (no name or state)` : ''}, in {check.states.length} state{check.states.length === 1 ? '' : 's'}: {check.states.slice(0, 8).join(', ')}{check.states.length > 8 ? '…' : ''}.
              <ul style={{ margin: '6px 0 0 16px', listStyle: 'disc' }}>{check.sample.map((s, i) => <li key={i}>{s.name}, {[s.district, s.state].filter(Boolean).join(', ')}{s.license ? ` · ${s.license}` : ''}</li>)}</ul>
            </Notice>
          )}
          <div className="row wrap">
            <button className="btn" disabled={!file || !!busy} onClick={() => run(true)}>{busy === 'check' ? <Loader2 size={16} className="spin" /> : null} Check file</button>
            <button className="btn primary" disabled={!file || !check || !!busy} onClick={() => run(false)}>{busy === 'import' ? <Loader2 size={16} className="spin" /> : null} Import {check ? check.total.toLocaleString('en-IN') : ''} centres</button>
          </div>
        </section>

        <section className="card pad stack s">
          <h3 style={{ fontSize: 16 }}>Where to get the official list</h3>
          <div className="small stack s">
            <p><b>National Health Portal blood bank directory.</b> Search “Blood Bank Directory” on <a className="link" href="https://www.data.gov.in" target="_blank" rel="noreferrer">data.gov.in <ExternalLink size={12} /></a>. Sign in, download the CSV, or use the API with your own free key and save the JSON.</p>
            <p><b>State Blood Transfusion Council lists.</b> Ask the SBTC (for Maharashtra, the Maharashtra SBTC) for the current licensed blood centre list. Open it in Excel, keep one header row, and save as CSV. Enter the state above if the file has no State column.</p>
            <p><b>Stock.</b> The government lists have no stock. Centres that join Raktkoshika show live stock; for the rest the directory links to <a className="link" href={ERAKTKOSH_URL} target="_blank" rel="noreferrer">e-RaktKosh <ExternalLink size={12} /></a>.</p>
            <p className="xs faint">Columns are matched by name: blood bank name, state, district, city, address, pincode, contact, mobile, email, category, components, apheresis, service time, licence number and dates, latitude and longitude.</p>
          </div>
        </section>
      </div>

      <DirectoryBrowser key={version} />
    </>
  );
}
