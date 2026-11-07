export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
export type Component = 'WB' | 'PRBC' | 'FFP' | 'PLT' | 'CRYO';
export type Role = 'user' | 'bank' | 'referral' | 'franchise' | 'admin';
export type BankType = 'Government' | 'Charitable' | 'Private';

export interface Bank {
  id: string; name: string; city: string; district: string; type: BankType; license: string;
  km: number; rating: number; open24: boolean; verified: boolean; syncMin: number; parentId?: string; phone: string; lat?: number; lng?: number;
}
export type BatchStatus = 'quarantine' | 'available' | 'reserved' | 'issued' | 'discarded';
export interface Batch {
  id: string; bankId: string; group: BloodGroup; component: Component; collected: string; expiry: string;
  status: BatchStatus; source: 'Voluntary' | 'Camp' | 'Replacement' | 'Transfer'; orderId?: string; discardReason?: string;
}
export type Stage = 'placed' | 'rx_verified' | 'sample_received' | 'crossmatched' | 'issued' | 'completed' | 'rejected' | 'cancelled';
export interface OrderEvent { stage: Stage; at: string; note?: string }
export interface Order {
  id: string; ownerId: string; kind: 'order' | 'booking'; urgency: 'sos' | 'routine';
  patient: { name: string; age: number; hospital: string; ward: string; doctor: string };
  group: BloodGroup; component: Component; units: number; bankId: string; scheduledFor?: string; seriesId?: string;
  fulfilment: 'collect' | 'delivery'; rx: string; rxFileId?: string; stage: Stage; events: OrderEvent[];
  payment: { method: 'wallet' | 'counter'; fee: number; total: number; creditsUsed: number; cash: number; settled: boolean };
  reaction?: string;
}
export type LedgerKind = 'topup' | 'hold' | 'capture' | 'release' | 'refund' | 'credit_earn' | 'credit_hold' | 'credit_use' | 'credit_release' | 'credit_gift' | 'settlement';
export interface LedgerEntry { id: string; at: string; kind: LedgerKind; amount: number; credits: number; note: string; ref?: string }
export interface Wallet { ownerId: string; balance: number; held: number; credits: number; creditsHeld: number; ledger: LedgerEntry[] }
export interface Donation {
  id: string; donorId: string; donorName: string; group: BloodGroup; bankId: string; date: string; slot: string;
  status: 'booked' | 'completed' | 'deferred' | 'cancelled'; hb?: number; note?: string; campId?: string;
}
export interface Camp {
  id: string; org: string; requestedBy: string; venue: string; city: string; date: string; target: number;
  bankIds: string[]; acceptedBy?: string; status: 'requested' | 'accepted' | 'completed' | 'declined'; registered: number; collected: number;
}
export interface DonorRequest {
  id: string; byId: string; byName: string; group: BloodGroup; units: number; hospital: string; city: string;
  neededBy: string; note: string; feeSupport: boolean; responders: string[]; status: 'open' | 'fulfilled' | 'closed'; broadcast?: boolean;
}
export interface Message { id: string; from: string; text: string; at: string }
export interface Thread { id: string; title: string; subtitle: string; members: string[]; messages: Message[]; kind: 'direct' | 'broadcast' }
export type Tone = 'info' | 'good' | 'warn' | 'crit';
export interface Notice { id: string; to: Role | 'all'; title: string; body: string; at: string; read: boolean; link?: string; tone: Tone }
export interface Referral { id: string; bankId: string; name: string; kind: 'Hospital' | 'Clinic' | 'Doctor' | 'Nursing home'; city: string; plan: 'Monthly' | 'Quarterly' | 'Yearly'; units: number; status: 'active' | 'invited'; contact: string }
export interface AccountEntry { id: string; bankId: string; at: string; kind: 'income' | 'expense'; head: string; amount: number; ref?: string }
export interface Application { id: string; name: string; city: string; district: string; license: string; docs: { name: string; ok: boolean }[]; franchiseId: string; status: 'pending' | 'approved' | 'rejected'; at: string; type: BankType }
export type LeadStage = 'Lead' | 'Demo done' | 'Documents' | 'Live';
export interface Lead { id: string; name: string; city: string; contact: string; stage: LeadStage; plan: string }
export interface Ticket { id: string; from: string; subject: string; priority: 'High' | 'Normal'; status: 'open' | 'resolved'; at: string }
export interface AuditEntry { id: string; at: string; actor: string; action: string; target: string }
export interface FamilyMember { id: string; name: string; relation: string; group: BloodGroup }
export interface Profile {
  id: string; name: string; phone: string; city: string; group: BloodGroup; age: number; weight: number; sex: 'F' | 'M';
  lastDonation?: string; donorActive: boolean; rareDonor: boolean; shareContact: boolean; family: FamilyMember[];
}
export interface ThalPlan { id: string; ownerId: string; patient: string; group: BloodGroup; component: Component; units: number; everyDays: number; bankId: string; next: string; active: boolean }
export interface MonthPoint { m: string; collected: number; issued: number }
export interface Sensor { id: string; bankId: string; name: string; kind: 'Red cells' | 'Platelets' | 'Plasma'; temp: number; min: number; max: number }
export interface DB {
  banks: Bank[]; batches: Batch[]; orders: Order[]; wallets: Record<string, Wallet>; donations: Donation[]; camps: Camp[];
  requests: DonorRequest[]; threads: Thread[]; notices: Notice[]; referrals: Referral[]; accounts: AccountEntry[];
  applications: Application[]; leads: Lead[]; tickets: Ticket[]; audit: AuditEntry[]; profile: Profile; plans: ThalPlan[];
  months: MonthPoint[]; sensors: Sensor[];
  /** Signed-in account, sent by the server in API mode. */
  me?: { id: string; role: Role; name: string; org: string; initials: string };
}
