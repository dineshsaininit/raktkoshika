import { useState } from 'react';
import { Download, Plus, Trash2 } from 'lucide-react';
import type { BloodGroup } from '../../data/types';
import { useStore } from '../../store/store';
import { Field, GroupPicker, gl, GroupTag, Modal, PageHead, Switch, useToast } from '../../ui/kit';

export function Profile() {
  const { db, act } = useStore();
  const toast = useToast();
  const p = db.profile;
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', relation: '', group: 'O+' as BloodGroup });
  return (
    <>
      <PageHead title="Profile" sub="Your details, your family, and how you want to be contacted." />
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <section className="card pad stack">
          <div className="row"><GroupTag g={p.group} size="lg" solid /><div><h3 style={{ fontSize: 20 }}>{p.name}</h3><div className="small muted">{p.phone} · verified</div></div></div>
          <div className="grid g2">
            <Field label="Full name"><input className="input" value={p.name} onChange={(e) => act.updateProfile({ name: e.target.value })} /></Field>
            <Field label="City"><input className="input" value={p.city} onChange={(e) => act.updateProfile({ city: e.target.value })} /></Field>
            <Field label="Age"><input className="input" inputMode="numeric" value={p.age} onChange={(e) => act.updateProfile({ age: Number(e.target.value.replace(/\D/g, '')) })} /></Field>
            <Field label="Weight (kg)"><input className="input" inputMode="numeric" value={p.weight} onChange={(e) => act.updateProfile({ weight: Number(e.target.value.replace(/\D/g, '')) })} /></Field>
          </div>
          <div className="field"><span className="label">Blood group</span><GroupPicker value={p.group} onChange={(group) => act.updateProfile({ group })} /></div>
        </section>
        <div className="stack">
          <section className="card pad stack">
            <h3 style={{ fontSize: 17 }}>Donor preferences</h3>
            <label className="row between"><span><b>Tell me when my group is needed</b><span className="xs muted" style={{ display: 'block' }}>Only nearby requests, at most a few a month</span></span><Switch on={p.donorActive} onChange={(v) => act.updateProfile({ donorActive: v })} label="Donor alerts" /></label>
            <label className="row between"><span><b>List me as a rare donor</b><span className="xs muted" style={{ display: 'block' }}>For rare groups, with centre confirmation</span></span><Switch on={p.rareDonor} onChange={(v) => act.updateProfile({ rareDonor: v })} label="Rare donor" /></label>
            <label className="row between"><span><b>Share my phone number in chats</b><span className="xs muted" style={{ display: 'block' }}>Off means others see only your first name</span></span><Switch on={p.shareContact} onChange={(v) => act.updateProfile({ shareContact: v })} label="Share phone number" /></label>
          </section>
          <section className="card">
            <div className="card-head"><h3>Family</h3><button className="btn sm" onClick={() => setOpen(true)}><Plus size={14} /> Add</button></div>
            {p.family.map((m) => <div className="list-row" key={m.id}><GroupTag g={m.group} size="sm" /><div className="grow"><b>{m.name}</b><div className="xs muted">{m.relation}</div></div></div>)}
          </section>
          <section className="card pad stack s">
            <h3 style={{ fontSize: 17 }}>Your data</h3>
            <p className="small muted">Health details are used only to arrange blood, and only with your consent. You can take a copy or close your account any time.</p>
            <div className="row wrap">
              <button className="btn sm" onClick={() => toast('Your data copy would be emailed in the live product')}><Download size={14} /> Download my data</button>
              <button className="btn sm danger" onClick={() => toast('Account deletion would start here in the live product')}><Trash2 size={14} /> Delete account</button>
            </div>
          </section>
        </div>
      </div>
      {open && (
        <Modal title="Add family member" sub={`They can receive credits you reserve, like ${gl(p.group)} donor credits from you.`} onClose={() => setOpen(false)}>
          <div className="stack">
            <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Relation"><input className="input" value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })} placeholder="Father, daughter…" /></Field>
            <div className="field"><span className="label">Blood group</span><GroupPicker value={f.group} onChange={(group) => setF({ ...f, group })} /></div>
            <button className="btn primary block" disabled={!f.name.trim() || !f.relation.trim()} onClick={() => { act.addFamily(f.name, f.relation, f.group); setOpen(false); setF({ name: '', relation: '', group: 'O+' }); toast('Family member added'); }}>Add</button>
          </div>
        </Modal>
      )}
    </>
  );
}
