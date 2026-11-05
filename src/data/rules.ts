import type { Bank, BloodGroup, Component, Profile } from './types';

export const GROUPS: BloodGroup[] = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'];

export const COMPONENTS: Record<Component, { name: string; short: string; desc: string; shelfDays: number; storage: string }> = {
  PRBC: { name: 'Packed red cells', short: 'Red cells', desc: 'Anaemia, thalassaemia, surgery, childbirth bleeding', shelfDays: 42, storage: '2–6 °C' },
  WB: { name: 'Whole blood', short: 'Whole blood', desc: 'Major blood loss when components are not available', shelfDays: 35, storage: '2–6 °C' },
  PLT: { name: 'Platelets', short: 'Platelets', desc: 'Dengue, chemotherapy, low platelet bleeding', shelfDays: 5, storage: '20–24 °C, agitated' },
  FFP: { name: 'Fresh frozen plasma', short: 'Plasma', desc: 'Clotting factor loss, liver disease, burns', shelfDays: 365, storage: '−30 °C or below' },
  CRYO: { name: 'Cryoprecipitate', short: 'Cryo', desc: 'Haemophilia, low fibrinogen', shelfDays: 365, storage: '−30 °C or below' },
};
export const COMPONENT_KEYS = Object.keys(COMPONENTS) as Component[];

/**
 * Per-unit processing charges as reported from the NBTC Revised Guidelines (14 June 2022).
 * Blood is not for sale: these are the only amounts a centre may charge. Confirm the current
 * NBTC/CDSCO circular before launch and keep this table configurable.
 */
export const FEES: Record<Component, { gov: number; other: number }> = {
  WB: { gov: 1100, other: 1550 },
  PRBC: { gov: 1100, other: 1550 },
  FFP: { gov: 300, other: 400 },
  PLT: { gov: 300, other: 400 },
  CRYO: { gov: 200, other: 250 },
};
export const processingFee = (c: Component, b: Pick<Bank, 'type'>) => (b.type === 'Government' ? FEES[c].gov : FEES[c].other);

const RBC: Record<BloodGroup, BloodGroup[]> = {
  'O-': ['O-'], 'O+': ['O+', 'O-'], 'A-': ['A-', 'O-'], 'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'O-'], 'B+': ['B+', 'B-', 'O+', 'O-'], 'AB-': ['AB-', 'A-', 'B-', 'O-'], 'AB+': ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'],
};
const abo = (g: BloodGroup) => g.replace(/[+-]/, '');
const PLASMA_ABO: Record<string, string[]> = { O: ['O', 'A', 'B', 'AB'], A: ['A', 'AB'], B: ['B', 'AB'], AB: ['AB'] };

/** Groups a recipient can receive. Shown as "ask the treating doctor", never auto-substituted. */
export function compatibleDonors(recipient: BloodGroup, c: Component): BloodGroup[] {
  if (c === 'WB') return [recipient];
  if (c === 'PRBC') return RBC[recipient];
  return GROUPS.filter((g) => PLASMA_ABO[abo(recipient)].includes(abo(g)));
}

export const DONATION_GAP = { M: 90, F: 120 } as const;
export const MIN_HB = 12.5;

export function nextEligibleDate(p: Pick<Profile, 'lastDonation' | 'sex'>): Date | null {
  if (!p.lastDonation) return null;
  const d = new Date(p.lastDonation);
  d.setDate(d.getDate() + DONATION_GAP[p.sex]);
  return d;
}
export function daysUntilEligible(p: Pick<Profile, 'lastDonation' | 'sex'>): number {
  const n = nextEligibleDate(p);
  if (!n) return 0;
  return Math.max(0, Math.ceil((n.getTime() - Date.now()) / 864e5));
}

export const STAGES = [
  { key: 'placed', label: 'Request placed', hint: 'Money held, not charged', action: 'Verify prescription' },
  { key: 'rx_verified', label: 'Prescription verified', hint: 'Checked by the blood centre', action: 'Mark sample received' },
  { key: 'sample_received', label: 'Patient sample received', hint: 'Needed for cross-match', action: 'Record compatible cross-match' },
  { key: 'crossmatched', label: 'Cross-match compatible', hint: 'Units reserved for this patient', action: 'Issue units' },
  { key: 'issued', label: 'Issued', hint: 'Processing charge settled', action: 'Confirm handover' },
  { key: 'completed', label: 'Handed over', hint: 'Received in cold chain', action: '' },
] as const;
export const stageIndex = (s: string) => STAGES.findIndex((x) => x.key === s);
export const stageLabel = (s: string) => (s === 'rejected' ? 'Declined' : s === 'cancelled' ? 'Cancelled' : STAGES[stageIndex(s)]?.label ?? s);

export const inr = (n: number) => (n < 0 ? '−' : '') + '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');
export const fmtDate = (s: string | Date) => new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtShort = (s: string | Date) => new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const fmtTime = (s: string | Date) => new Date(s).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
export const fmtDT = (s: string | Date) => `${fmtShort(s)}, ${fmtTime(s)}`;
export function ago(s: string) {
  const m = Math.round((Date.now() - new Date(s).getTime()) / 6e4);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} d ago`;
}
export const daysLeft = (s: string) => Math.ceil((new Date(s).getTime() - Date.now()) / 864e5);
export const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
