import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { FindResults } from '../shared/FindBlood';
import { Logo, Notice } from '../../ui/kit';

export default function PublicFind() {
  return (
    <>
      <div style={{ background: '#16202E', color: '#F3F0EA', padding: '14px clamp(16px, 4vw, 56px)' }} className="row between">
        <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}><Logo size={30} /></Link>
        <Link to="/login" className="btn sm" style={{ background: 'rgba(255,255,255,.1)', color: '#fff', borderColor: 'rgba(255,255,255,.25)' }}>Sign in</Link>
      </div>
      <main className="page">
        <Link to="/" className="link" style={{ marginBottom: 10 }}><ArrowLeft size={15} /> Home</Link>
        <h1 style={{ fontSize: 32, marginBottom: 6 }}>Find blood near you</h1>
        <p className="muted" style={{ marginBottom: 18 }}>No account needed to search. You sign in only when you place a request.</p>
        <div style={{ marginBottom: 18 }}><Notice tone="crit"><b>Life-threatening emergency?</b> Call the hospital or your local emergency number first. Blood must be cross-matched and given in a hospital.</Notice></div>
        <FindResults orderBase="/app/user/order" />
      </main>
    </>
  );
}
