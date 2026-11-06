import type { Role } from './types';

/**
 * Sample sign-ins created by the server's seed. Shared by the server (to create them) and the login page
 * (to show them). They give access to sample data only. Change or remove them before real data goes in.
 */
export interface DemoAccount { id: string; role: Role; phone: string; password: string; name: string; org: string; initials: string; note: string }

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { id: 'u1', role: 'user', phone: '9000000001', password: 'Patient@123', name: 'Riya Kulkarni', org: 'Donor & patient family', initials: 'RK', note: 'Has orders, a wallet balance and 2 donor credits' },
  { id: 'u2', role: 'user', phone: '9000000006', password: 'Donor@123', name: 'Arjun Deshmukh', org: 'Donor & patient family', initials: 'AD', note: 'New donor, eligible to donate today' },
  { id: 'b1', role: 'bank', phone: '9000000002', password: 'Centre@123', name: 'Dr. Meera Patil', org: 'Krishna Valley Blood Centre', initials: 'MP', note: 'Charitable centre with a branch in Islampur' },
  { id: 'b2', role: 'bank', phone: '9000000007', password: 'Civic@123', name: 'Dr. Anand Kamble', org: 'Miraj Civic Blood Centre', initials: 'AK', note: 'Government centre, lower charges' },
  { id: 'r1', role: 'referral', phone: '9000000003', password: 'Hospital@123', name: 'Dr. Sameer Joshi', org: 'Sanjeevani Hospital', initials: 'SJ', note: 'Hospital with patients in progress' },
  { id: 'r9', role: 'referral', phone: '9000000009', password: 'Clinic@123', name: 'Dr. A. Gokhale', org: 'Lifeline Clinic', initials: 'AG', note: 'Clinic with a platelet order' },
  { id: 'f1', role: 'franchise', phone: '9000000004', password: 'Franchise@123', name: 'Vikram Jadhav', org: 'South Maharashtra franchise', initials: 'VJ', note: 'Covers Sangli, Kolhapur and Satara' },
  { id: 'a1', role: 'admin', phone: '9000000005', password: 'Admin@123', name: 'Network Ops', org: 'Raktkoshika HQ', initials: 'RO', note: 'Sees the whole network' },
];
