import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { Role } from '../../data/types';
import { PERSONA } from '../../data/seed';
import { ROLE_ICON, ROLE_LABEL } from '../../layouts/Shell';
import { Logo, Notice } from '../../ui/kit';

const BLURB: Record<Role, string> = {
  user: 'Order blood, donate, use your wallet and credits',
  bank: 'Run requests, stock, donors, reports and accounts',
  referral: 'Order for patients and set up regular transfusions',
  franchise: 'Sign up centres in your territory and track earnings',
  admin: 'Watch the network, verify licences, model revenue',
};

export default function Login() {
  return (
    <div className="login">
      <aside className="login-art">
        <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}><Logo size={34} sub /></Link>
        <div className="hide-m">
          <h1>Every centre, donor and hospital on one network.</h1>
          <p style={{ marginTop: 14, color: '#BEC7D2', maxWidth: '40ch' }}>Tip for the demo: open the patient portal and the blood centre portal in two browser windows. Actions in one appear in the other straight away.</p>
        </div>
      </aside>
      <main className="login-main">
        <div>
          <h2 style={{ fontSize: 30 }}>Choose a portal</h2>
          <p className="muted" style={{ marginTop: 6 }}>Each sample user below shows what that person would see.</p>
        </div>
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => {
          const I = ROLE_ICON[r];
          return (
            <Link key={r} to={`/app/${r}`} className="role-card">
              <span className="ic"><I size={22} /></span>
              <span className="grow">
                <span className="strong" style={{ display: 'block', fontSize: 16 }}>{ROLE_LABEL[r]}</span>
                <span className="small muted" style={{ display: 'block' }}>{BLURB[r]}</span>
                <span className="xs faint" style={{ display: 'block', marginTop: 2 }}>Signed in as {PERSONA[r].name}</span>
              </span>
              <ArrowRight size={18} className="faint" />
            </Link>
          );
        })}
        <Notice tone="info">In the live product, people sign in with a mobile number and one-time code. Centres and hospitals also get staff roles.</Notice>
      </main>
    </div>
  );
}
