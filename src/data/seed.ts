import type { Bank, Batch, BloodGroup, Component, DB, MonthPoint, Order, Wallet } from './types';
import { COMPONENTS, COMPONENT_KEYS, GROUPS, processingFee } from './rules';

export const ME = { user: 'u1', bank: 'b1', referral: 'r1', franchise: 'f1', admin: 'a1' } as const;
export const PERSONA = {
  user: { name: 'Riya Kulkarni', org: 'Donor & patient family', initials: 'RK' },
  bank: { name: 'Dr. Meera Patil', org: 'Krishna Valley Blood Centre', initials: 'MP' },
  referral: { name: 'Dr. Sameer Joshi', org: 'Sanjeevani Hospital, Miraj', initials: 'SJ' },
  franchise: { name: 'Vikram Jadhav', org: 'South Maharashtra franchise', initials: 'VJ' },
  admin: { name: 'Network Ops', org: 'Raktkoshika HQ', initials: 'RO' },
} as const;

let n = 1;
const rand = () => { n = (n * 16807) % 2147483647; return (n - 1) / 2147483646; };
const ri = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const iso = (days: number, hours = 0) => new Date(Date.now() + days * 864e5 + hours * 36e5).toISOString();

const banks: Bank[] = [
  { id: 'b1', name: 'Krishna Valley Blood Centre', city: 'Sangli', district: 'Sangli', type: 'Charitable', license: 'MH/BB/SGL/0142', km: 2.1, rating: 4.8, open24: true, verified: true, syncMin: 2, phone: '+91 90000 10001' },
  { id: 'b2', name: 'Miraj Civic Blood Centre', city: 'Miraj', district: 'Sangli', type: 'Government', license: 'MH/BB/SGL/0097', km: 8.4, rating: 4.3, open24: true, verified: true, syncMin: 11, phone: '+91 90000 10002' },
  { id: 'b7', name: 'Krishna Valley, Islampur Centre', city: 'Islampur', district: 'Sangli', type: 'Charitable', license: 'MH/BB/SGL/0143', km: 32, rating: 4.6, open24: false, verified: true, syncMin: 6, parentId: 'b1', phone: '+91 90000 10007' },
  { id: 'b3', name: 'Panchganga Blood Centre', city: 'Kolhapur', district: 'Kolhapur', type: 'Charitable', license: 'MH/BB/KOP/0211', km: 48, rating: 4.7, open24: true, verified: true, syncMin: 4, phone: '+91 90000 10003' },
  { id: 'b4', name: 'Satara Seva Blood Centre', city: 'Satara', district: 'Satara', type: 'Charitable', license: 'MH/BB/STR/0076', km: 118, rating: 4.5, open24: false, verified: true, syncMin: 23, phone: '+91 90000 10004' },
  { id: 'b5', name: 'Bhima Valley Blood Centre', city: 'Solapur', district: 'Solapur', type: 'Government', license: 'MH/BB/SLP/0163', km: 190, rating: 4.1, open24: true, verified: true, syncMin: 38, phone: '+91 90000 10005' },
  { id: 'b6', name: 'Deccan Life Blood Centre', city: 'Pune', district: 'Pune', type: 'Private', license: 'MH/BB/PNQ/0388', km: 235, rating: 4.6, open24: true, verified: true, syncMin: 3, phone: '+91 90000 10006' },
];

const GROUP_WEIGHT: Record<BloodGroup, number> = { 'O+': 10, 'B+': 10, 'A+': 7, 'AB+': 3, 'O-': 1.2, 'B-': 1.2, 'A-': 1.2, 'AB-': 0.5 };
const COMP_WEIGHT: Record<Component, number> = { PRBC: 1, FFP: 0.7, PLT: 0.28, WB: 0.25, CRYO: 0.14 };

function makeBatches(): Batch[] {
  const out: Batch[] = [];
  let i = 1000;
  for (const b of banks) {
    const scale = b.id === 'b1' ? 1.3 : b.id === 'b6' ? 1.2 : b.id === 'b7' ? 0.45 : 0.8;
    for (const g of GROUPS) for (const c of COMPONENT_KEYS) {
      const count = Math.round(GROUP_WEIGHT[g] * COMP_WEIGHT[c] * scale * (0.6 + rand() * 0.8));
      for (let k = 0; k < count; k++) {
        const shelf = COMPONENTS[c].shelfDays;
        const age = c === 'PLT' ? ri(0, 3) : Math.floor(rand() * shelf * (rand() > 0.9 ? 0.95 : 0.55));
        out.push({
          id: `U${i++}`, bankId: b.id, group: g, component: c, collected: iso(-age), expiry: iso(shelf - age),
          status: 'available', source: rand() > 0.72 ? 'Camp' : rand() > 0.2 ? 'Voluntary' : 'Replacement',
        });
      }
    }
  }
  // A deliberately tense picture at the home centre: O− almost out, B− out, platelets about to expire.
  return out.filter((u) => !(u.bankId === 'b1' && ((u.group === 'O-' && u.component === 'PRBC') || (u.group === 'B-' && u.component === 'PRBC')))).concat([
    { id: 'U9001', bankId: 'b1', group: 'O-', component: 'PRBC', collected: iso(-30), expiry: iso(12), status: 'available', source: 'Voluntary' },
    ...(['A+', 'B+', 'O+'] as BloodGroup[]).map((g, x): Batch => ({ id: `U910${x}`, bankId: 'b1', group: g, component: 'PLT', collected: iso(-4), expiry: iso(1), status: 'available', source: 'Camp' })),
    ...[0, 1].map((x): Batch => ({ id: `Q920${x}`, bankId: 'b1', group: x ? 'B+' : 'O+', component: 'PRBC', collected: iso(0, -5), expiry: iso(42), status: 'quarantine', source: 'Camp' })),
  ]);
}

function wallet(ownerId: string, balance: number, credits: number, ledger: Wallet['ledger'] = []): Wallet {
  return { ownerId, balance, held: 0, credits, creditsHeld: 0, ledger };
}

function order(id: string, ownerId: string, stage: Order['stage'], o: Partial<Order> & Pick<Order, 'group' | 'component' | 'units' | 'bankId'>, ageH: number): Order {
  const flow: Order['stage'][] = ['placed', 'rx_verified', 'sample_received', 'crossmatched', 'issued', 'completed'];
  const upto = flow.indexOf(stage);
  const bank = banks.find((b) => b.id === o.bankId)!;
  const fee = processingFee(o.component, bank);
  return {
    id, ownerId, kind: 'order', urgency: 'routine', stage,
    patient: { name: 'Anil Kulkarni', age: 58, hospital: 'Sanjeevani Hospital, Miraj', ward: 'ICU-2', doctor: 'Dr. S. Joshi' },
    fulfilment: 'collect', rx: 'prescription.pdf',
    events: flow.slice(0, upto + 1).map((s, k) => ({ stage: s, at: iso(0, -ageH + k * 0.7) })),
    payment: { method: 'wallet', fee, total: fee * o.units, creditsUsed: 0, cash: fee * o.units, settled: ['issued', 'completed'].includes(stage) },
    ...o,
  };
}

const MONTHS = ['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];

export function makeSeed(): DB {
  n = 20261105;
  const orders: Order[] = [
    order('RK-20422', 'r1', 'placed', { group: 'B+', component: 'PRBC', units: 3, bankId: 'b1', urgency: 'sos', patient: { name: 'Sunita More', age: 34, hospital: 'Sanjeevani Hospital, Miraj', ward: 'Labour room', doctor: 'Dr. S. Joshi' }, fulfilment: 'delivery' }, 0.3),
    order('RK-20418', 'u1', 'sample_received', { group: 'O+', component: 'PRBC', units: 2, bankId: 'b1', urgency: 'sos' }, 3),
    order('RK-20421', 'r1', 'rx_verified', { group: 'A+', component: 'FFP', units: 2, bankId: 'b1', patient: { name: 'Ganesh Shinde', age: 61, hospital: 'Sanjeevani Hospital, Miraj', ward: 'Ward 4', doctor: 'Dr. R. Deshmukh' }, fulfilment: 'delivery' }, 2),
    order('RK-20419', 'r9', 'crossmatched', { group: 'AB+', component: 'PLT', units: 1, bankId: 'b1', patient: { name: 'Pooja Sawant', age: 22, hospital: 'Lifeline Clinic, Sangli', ward: 'Dengue ward', doctor: 'Dr. A. Gokhale' } }, 5),
    { ...order('RK-20430', 'r1', 'placed', { group: 'B-', component: 'PRBC', units: 1, bankId: 'b2', patient: { name: 'Aditya Pawar', age: 11, hospital: 'Sanjeevani Hospital, Miraj', ward: 'Day care', doctor: 'Dr. S. Joshi' } }, 1), kind: 'booking' as const, scheduledFor: iso(6), seriesId: 'T1' },
    order('RK-20377', 'u1', 'completed', { group: 'O+', component: 'PLT', units: 1, bankId: 'b2' }, 240),
    order('RK-20360', 'r1', 'completed', { group: 'O+', component: 'PRBC', units: 2, bankId: 'b1', patient: { name: 'Ramesh Patil', age: 49, hospital: 'Sanjeevani Hospital, Miraj', ward: 'OT 1', doctor: 'Dr. R. Deshmukh' } }, 96),
    order('RK-20355', 'r1', 'completed', { group: 'A+', component: 'WB', units: 1, bankId: 'b2', patient: { name: 'Lata Chavan', age: 67, hospital: 'Sanjeevani Hospital, Miraj', ward: 'Ward 2', doctor: 'Dr. S. Joshi' } }, 150),
  ];
  const months: MonthPoint[] = MONTHS.map((m, i) => ({ m, collected: [212, 196, 188, 240, 171, 148, 162, 219, 233, 251, 268, 244][i], issued: [201, 204, 191, 226, 186, 169, 158, 204, 228, 262, 259, 237][i] }));
  const batches = makeBatches();
  batches.filter((u) => u.bankId === 'b1' && u.group === 'AB+' && u.component === 'PLT' && u.status === 'available').slice(0, 1)
    .forEach((u) => { u.status = 'reserved'; u.orderId = 'RK-20419'; });

  const wallets: DB['wallets'] = {
    u1: wallet('u1', 3500, 2, [
      { id: 'L5', at: iso(0, -3), kind: 'hold', amount: -3100, credits: 0, note: 'Held for order RK-20418', ref: 'RK-20418' },
      { id: 'L4', at: iso(-2), kind: 'topup', amount: 5000, credits: 0, note: 'Added via UPI' },
      { id: 'L3', at: iso(-10), kind: 'capture', amount: -300, credits: 0, note: 'Processing charge, order RK-20377', ref: 'RK-20377' },
      { id: 'L2', at: iso(-130), kind: 'credit_earn', amount: 0, credits: 1, note: 'Verified donation at Krishna Valley' },
      { id: 'L1', at: iso(-290), kind: 'credit_earn', amount: 0, credits: 1, note: 'Verified donation at Miraj Civic' },
    ]),
    r1: wallet('r1', 42500, 6, [
      { id: 'L7', at: iso(-1), kind: 'topup', amount: 25000, credits: 0, note: 'Hospital account top-up via NEFT' },
      { id: 'L6', at: iso(-4), kind: 'capture', amount: -3100, credits: 0, note: 'Processing charge, order RK-20360', ref: 'RK-20360' },
    ]),
    r9: wallet('r9', 5000, 0),
    b1: wallet('b1', 186400, 0, [
      { id: 'L9', at: iso(-1), kind: 'settlement', amount: -150000, credits: 0, note: 'Paid out to bank account ending 4417' },
      { id: 'L8', at: iso(-4), kind: 'settlement', amount: 3100, credits: 0, note: 'Received, order RK-20360', ref: 'RK-20360' },
    ]),
    f1: wallet('f1', 28750, 0, [{ id: 'L10', at: iso(-5), kind: 'settlement', amount: 28750, credits: 0, note: 'October software revenue share' }]),
    a1: wallet('a1', 412000, 0),
  };
  // Held amounts always equal the open orders, so wallet and orders can never disagree on first load.
  orders.filter((o) => !o.payment.settled && o.payment.method === 'wallet').forEach((o) => { if (wallets[o.ownerId]) wallets[o.ownerId].held += o.payment.cash; });

  return {
    banks, batches, orders, months, wallets,
    donations: [
      { id: 'D-841', donorId: 'd4', donorName: 'Mahesh Kadam', group: 'O-', bankId: 'b1', date: iso(0, 2), slot: '11:30 am', status: 'booked' },
      { id: 'D-842', donorId: 'd5', donorName: 'Sneha Mane', group: 'B+', bankId: 'b1', date: iso(0, 3), slot: '12:00 pm', status: 'booked' },
      { id: 'D-843', donorId: 'd6', donorName: 'Rahul Nikam', group: 'A+', bankId: 'b1', date: iso(0, 5), slot: '2:30 pm', status: 'booked' },
      { id: 'D-838', donorId: 'd7', donorName: 'Kavita Bhosale', group: 'O+', bankId: 'b1', date: iso(-1), slot: '10:00 am', status: 'completed', hb: 13.8 },
      { id: 'D-836', donorId: 'd8', donorName: 'Pradeep Salunkhe', group: 'A-', bankId: 'b1', date: iso(-1), slot: '11:00 am', status: 'deferred', hb: 11.9, note: 'Haemoglobin below 12.5 g/dL' },
      { id: 'D-801', donorId: 'u1', donorName: 'Riya Kulkarni', group: 'O+', bankId: 'b1', date: iso(-130), slot: '10:30 am', status: 'completed', hb: 13.4 },
      { id: 'D-612', donorId: 'u1', donorName: 'Riya Kulkarni', group: 'O+', bankId: 'b2', date: iso(-290), slot: '4:00 pm', status: 'completed', hb: 13.1 },
    ],
    camps: [
      { id: 'C-71', org: 'Walchand College NSS Unit', requestedBy: 'r3', venue: 'Main auditorium', city: 'Sangli', date: iso(9), target: 120, bankIds: ['b1', 'b2'], status: 'requested', registered: 64, collected: 0 },
      { id: 'C-68', org: 'Sanjeevani Hospital', requestedBy: 'r1', venue: 'Hospital OPD lobby', city: 'Miraj', date: iso(17), target: 80, bankIds: ['b1'], acceptedBy: 'b1', status: 'accepted', registered: 31, collected: 0 },
      { id: 'C-59', org: 'Sangli Traders Association', requestedBy: 'u1', venue: 'Vishrambag Hall', city: 'Sangli', date: iso(-21), target: 100, bankIds: ['b1'], acceptedBy: 'b1', status: 'completed', registered: 118, collected: 96 },
    ],
    requests: [
      { id: 'DR-310', byId: 'r1', byName: 'Sanjeevani Hospital', group: 'B-', units: 2, hospital: 'Sanjeevani Hospital, Miraj', city: 'Miraj', neededBy: iso(1), note: 'Child on regular thalassaemia transfusion. Rare group not in stock locally.', feeSupport: true, responders: ['Tejas W.'], status: 'open' },
      { id: 'DR-308', byId: 'u7', byName: 'Prakash G.', group: 'O-', units: 1, hospital: 'Kolhapur Civil Hospital', city: 'Kolhapur', neededBy: iso(0, 20), note: 'Surgery on Friday morning.', feeSupport: false, responders: [], status: 'open' },
      { id: 'DR-302', byId: 'u8', byName: 'Nandini S.', group: 'O+', units: 3, hospital: 'Lifeline Clinic, Sangli', city: 'Sangli', neededBy: iso(2), note: 'Post-partum bleeding, stable now.', feeSupport: false, responders: ['Omkar P.', 'Isha D.'], status: 'open' },
    ],
    threads: [
      { id: 'T-1', title: 'Krishna Valley Blood Centre', subtitle: 'Order RK-20418', kind: 'direct', members: ['u1', 'b1'], messages: [
        { id: 'm1', from: 'b1', text: 'Your request for 2 units O+ red cells is confirmed. Please send the patient sample from the ICU.', at: iso(0, -2.6) },
        { id: 'm2', from: 'u1', text: 'The nurse handed it to our attendant. Reaching in 20 minutes.', at: iso(0, -2.4) },
        { id: 'm3', from: 'b1', text: 'Sample received. Cross-match is running, we will update you shortly.', at: iso(0, -1.8) },
      ] },
      { id: 'T-2', title: 'Sanjeevani Hospital', subtitle: 'Referral partner', kind: 'direct', members: ['r1', 'b1'], messages: [
        { id: 'm4', from: 'r1', text: 'Labour room needs 3 units B+ urgently. Order RK-20422 is placed.', at: iso(0, -0.3) },
        { id: 'm5', from: 'b1', text: 'Seen. Rider will be ready once the sample is in.', at: iso(0, -0.2) },
      ] },
      { id: 'T-3', title: 'Raktkoshika Support', subtitle: 'Available 24×7', kind: 'direct', members: ['u1', 'r1', 'b1', 'f1', 'a1'], messages: [
        { id: 'm6', from: 'a1', text: 'Welcome to Raktkoshika. Your phone number stays hidden in chats unless you choose to share it.', at: iso(-3) },
      ] },
      { id: 'T-4', title: 'O− donors · Sangli', subtitle: 'Broadcast · 38 opted-in donors', kind: 'broadcast', members: ['u1', 'b1', 'r1', 'a1'], messages: [
        { id: 'm7', from: 'b1', text: 'O− red cell stock is at one unit. If you are eligible, please book a slot this week.', at: iso(0, -5) },
      ] },
      { id: 'T-5', title: 'Rohit Deshpande', subtitle: 'Raktkoshika onboarding', kind: 'direct', members: ['f1', 'a1'], messages: [
        { id: 'm8', from: 'a1', text: 'Two Kolhapur applications are waiting for licence checks.', at: iso(0, -26) },
      ] },
    ],
    notices: [
      { id: 'N1', to: 'user', title: 'Sample received for RK-20418', body: 'Cross-match is in progress at Krishna Valley.', at: iso(0, -1.8), read: false, link: 'orders/RK-20418', tone: 'info' },
      { id: 'N2', to: 'user', title: 'O+ donors needed in Sangli', body: 'Lifeline Clinic is looking for 3 donors of your group.', at: iso(0, -5), read: false, link: 'donor-requests', tone: 'warn' },
      { id: 'N3', to: 'bank', title: 'SOS: 3 units B+ for labour room', body: 'Sanjeevani Hospital · RK-20422', at: iso(0, -0.3), read: false, link: 'requests', tone: 'crit' },
      { id: 'N4', to: 'bank', title: '3 platelet units expire tomorrow', body: 'Offer them to nearby centres before they are lost.', at: iso(0, -6), read: false, link: 'stock', tone: 'warn' },
      { id: 'N5', to: 'referral', title: 'Booking confirmed for Aditya Pawar', body: 'Next thalassaemia transfusion in 6 days.', at: iso(0, -1), read: false, link: 'orders', tone: 'good' },
      { id: 'N6', to: 'franchise', title: 'Panchshil Hospital finished the demo', body: 'Send the documents checklist.', at: iso(0, -8), read: false, link: 'pipeline', tone: 'info' },
      { id: 'N7', to: 'admin', title: '2 centre applications to verify', body: 'Submitted by the South Maharashtra franchise.', at: iso(0, -26), read: false, link: 'verification', tone: 'warn' },
      { id: 'N8', to: 'admin', title: 'Bhima Valley stock is stale', body: 'Last sync over 30 minutes ago.', at: iso(0, -1), read: false, link: 'network', tone: 'warn' },
    ],
    referrals: [
      { id: 'r1', bankId: 'b1', name: 'Sanjeevani Hospital', kind: 'Hospital', city: 'Miraj', plan: 'Yearly', units: 412, status: 'active', contact: 'Dr. Sameer Joshi' },
      { id: 'r9', bankId: 'b1', name: 'Lifeline Clinic', kind: 'Clinic', city: 'Sangli', plan: 'Monthly', units: 138, status: 'active', contact: 'Dr. A. Gokhale' },
      { id: 'r3', bankId: 'b1', name: 'Mauli Nursing Home', kind: 'Nursing home', city: 'Tasgaon', plan: 'Quarterly', units: 96, status: 'active', contact: 'Sr. Vaishali Rane' },
      { id: 'r4', bankId: 'b1', name: 'Dr. Prashant Kale', kind: 'Doctor', city: 'Vita', plan: 'Monthly', units: 41, status: 'active', contact: 'Dr. Prashant Kale' },
      { id: 'r5', bankId: 'b1', name: 'Shree Ortho Care', kind: 'Clinic', city: 'Kupwad', plan: 'Monthly', units: 0, status: 'invited', contact: 'Reception' },
    ],
    accounts: ([
      ['income', 'Processing charges, red cells', 212400], ['income', 'Processing charges, plasma & platelets', 38800], ['income', 'Processing charges, cryo & whole blood', 21650],
      ['expense', 'Test kits (screening, grouping)', 74200], ['expense', 'Blood bags & consumables', 41800], ['expense', 'Staff salaries', 96000], ['expense', 'Electricity & cold chain upkeep', 18400], ['expense', 'Camp logistics', 12600], ['expense', 'Raktkoshika software plan', 2000],
    ] as const).map(([kind, head, amount], i) => ({ id: `A${i}`, bankId: 'b1', at: iso(-i - 2), kind, head, amount })),
    applications: [
      { id: 'AP-23', name: 'Jyotiba Blood Centre', city: 'Kolhapur', district: 'Kolhapur', license: 'MH/BB/KOP/0244', type: 'Charitable', franchiseId: 'f1', status: 'pending', at: iso(-1), docs: [{ name: 'FDA blood centre licence', ok: true }, { name: 'SBTC registration', ok: true }, { name: 'Medical officer registration', ok: true }, { name: 'e-RaktKosh ID', ok: true }] },
      { id: 'AP-24', name: 'Ichalkaranji Seva Blood Centre', city: 'Ichalkaranji', district: 'Kolhapur', license: 'MH/BB/KOP/0251', type: 'Charitable', franchiseId: 'f1', status: 'pending', at: iso(0, -26), docs: [{ name: 'FDA blood centre licence', ok: true }, { name: 'SBTC registration', ok: false }, { name: 'Medical officer registration', ok: true }, { name: 'e-RaktKosh ID', ok: true }] },
    ],
    leads: [
      { id: 'LD1', name: 'Panchshil Hospital', city: 'Karad', contact: 'Dr. Yadav', stage: 'Demo done', plan: 'Referral · Yearly' },
      { id: 'LD2', name: 'Wai Rural Blood Storage', city: 'Wai', contact: 'Mr. Pisal', stage: 'Lead', plan: 'Centre · Model 1' },
      { id: 'LD3', name: 'Ichalkaranji Seva Blood Centre', city: 'Ichalkaranji', contact: 'Dr. Lokhande', stage: 'Documents', plan: 'Centre · Master' },
      { id: 'LD4', name: 'Jyotiba Blood Centre', city: 'Kolhapur', contact: 'Ms. Ghatge', stage: 'Documents', plan: 'Centre · Master' },
      { id: 'LD5', name: 'Krishna Valley Blood Centre', city: 'Sangli', contact: 'Dr. Patil', stage: 'Live', plan: 'Centre · Master' },
      { id: 'LD6', name: 'Panchganga Blood Centre', city: 'Kolhapur', contact: 'Dr. Mohite', stage: 'Live', plan: 'Centre · Model 3' },
      { id: 'LD7', name: 'Mauli Nursing Home', city: 'Tasgaon', contact: 'Sr. Rane', stage: 'Live', plan: 'Referral · Quarterly' },
      { id: 'LD8', name: 'Vita Multispeciality', city: 'Vita', contact: 'Dr. Khot', stage: 'Lead', plan: 'Referral · Monthly' },
    ],
    tickets: [
      { id: 'TK-92', from: 'Krishna Valley Blood Centre', subject: 'Staff login for the Islampur centre', priority: 'High', status: 'open', at: iso(0, -3) },
      { id: 'TK-91', from: 'Panchganga Blood Centre', subject: 'Discard register export is missing a date column', priority: 'Normal', status: 'open', at: iso(0, -9) },
      { id: 'TK-88', from: 'Mauli Nursing Home', subject: 'Invoice name correction', priority: 'Normal', status: 'resolved', at: iso(-3) },
    ],
    audit: [
      { id: 'AU1', at: iso(0, -0.3), actor: 'Sanjeevani Hospital', action: 'Placed SOS order', target: 'RK-20422' },
      { id: 'AU2', at: iso(0, -1.8), actor: 'Dr. Meera Patil', action: 'Recorded sample received', target: 'RK-20418' },
      { id: 'AU3', at: iso(0, -6), actor: 'System', action: 'Flagged expiring platelets', target: 'Krishna Valley' },
      { id: 'AU4', at: iso(0, -26), actor: 'Vikram Jadhav', action: 'Submitted centre application', target: 'AP-24' },
    ],
    profile: {
      id: 'u1', name: 'Riya Kulkarni', phone: '+91 98••• ••210', city: 'Sangli', group: 'O+', age: 29, weight: 58, sex: 'F', lastDonation: iso(-130), donorActive: true, rareDonor: false, shareContact: false,
      family: [{ id: 'F1', name: 'Anil Kulkarni', relation: 'Father', group: 'O+' }, { id: 'F2', name: 'Sharada Kulkarni', relation: 'Mother', group: 'A+' }],
    },
    plans: [{ id: 'T1', ownerId: 'r1', patient: 'Aditya Pawar', group: 'B-', component: 'PRBC', units: 1, everyDays: 21, bankId: 'b2', next: iso(6), active: true }],
    sensors: [
      { id: 'S1', bankId: 'b1', name: 'Blood fridge A', kind: 'Red cells', temp: 4.1, min: 2, max: 6 },
      { id: 'S2', bankId: 'b1', name: 'Blood fridge B', kind: 'Red cells', temp: 5.7, min: 2, max: 6 },
      { id: 'S3', bankId: 'b1', name: 'Platelet agitator', kind: 'Platelets', temp: 22.3, min: 20, max: 24 },
      { id: 'S4', bankId: 'b1', name: 'Deep freezer', kind: 'Plasma', temp: -34, min: -60, max: -30 },
    ],
  };
}
