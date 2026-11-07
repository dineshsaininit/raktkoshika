import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { ERAKTKOSH_URL } from '../../api/client';
import { Logo } from '../../ui/kit';
import { DirectoryBrowser } from '../shared/Directory';

/** Public page: every licensed blood centre from government data, by state and district. */
export default function Centres() {
  return (
    <>
      <div style={{ background: '#16202E', color: '#F3F0EA', padding: '14px clamp(16px, 4vw, 56px)' }} className="row between">
        <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}><Logo size={30} /></Link>
        <div className="row">
          <Link to="/find" className="btn sm" style={{ background: 'rgba(255,255,255,.1)', color: '#fff', borderColor: 'rgba(255,255,255,.25)' }}>Find blood</Link>
          <Link to="/login" className="btn sm" style={{ background: 'rgba(255,255,255,.1)', color: '#fff', borderColor: 'rgba(255,255,255,.25)' }}>Sign in</Link>
        </div>
      </div>
      <main className="page">
        <Link to="/" className="link" style={{ marginBottom: 10 }}><ArrowLeft size={15} /> Home</Link>
        <h1 style={{ fontSize: 32, marginBottom: 6 }}>Licensed blood centres</h1>
        <p className="muted" style={{ marginBottom: 18, maxWidth: '70ch' }}>
          Every licensed blood centre from government records, searchable by state and district. Centres already on Raktkoshika show live stock.
          For the rest, check stock on <a href={ERAKTKOSH_URL} target="_blank" rel="noreferrer" className="link">e-RaktKosh <ExternalLink size={12} /></a> or call them.
        </p>
        <DirectoryBrowser findBase="/find" />
      </main>
    </>
  );
}
