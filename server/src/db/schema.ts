/**
 * Postgres schema for Raktkoshika. Every statement is idempotent, so it runs safely on each server start
 * (Render has no shell on the free plan, so the server sets itself up).
 *
 * Ids are the readable strings the frontend already uses (RK-20418, b1, U1042…).
 * Money is whole rupees (integer). Times are timestamptz.
 */
export const SCHEMA = /* sql */ `
create table if not exists users (
  id            text primary key,
  role          text not null check (role in ('user','bank','referral','franchise','admin')),
  name          text not null,
  org           text not null,
  initials      text not null,
  phone         text not null unique,
  password_hash text,
  bank_id       text,
  created_at    timestamptz not null default now()
);

create table if not exists banks (
  id         text primary key,
  name       text not null,
  city       text not null,
  district   text not null,
  type       text not null check (type in ('Government','Charitable','Private')),
  license    text not null unique,
  km         numeric not null default 0,
  rating     numeric not null default 5,
  open24     boolean not null default false,
  verified   boolean not null default false,
  sync_min   integer not null default 0,
  parent_id  text references banks(id) on delete set null,
  phone      text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists banks_parent on banks(parent_id);
alter table banks add column if not exists lat double precision;
alter table banks add column if not exists lng double precision;

create table if not exists files (
  id         text primary key,
  owner_id   text not null references users(id) on delete cascade,
  name       text not null,
  mime       text not null,
  size       integer not null,
  data       bytea not null,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id            text primary key,
  owner_id      text not null references users(id),
  kind          text not null check (kind in ('order','booking')),
  urgency       text not null check (urgency in ('sos','routine')),
  patient_name  text not null,
  patient_age   integer not null,
  hospital      text not null,
  ward          text not null,
  doctor        text not null,
  grp           text not null,
  component     text not null check (component in ('WB','PRBC','FFP','PLT','CRYO')),
  units         integer not null check (units between 1 and 10),
  bank_id       text not null references banks(id),
  scheduled_for timestamptz,
  series_id     text,
  fulfilment    text not null check (fulfilment in ('collect','delivery')),
  rx            text not null,
  rx_file_id    text references files(id) on delete set null,
  stage         text not null check (stage in ('placed','rx_verified','sample_received','crossmatched','issued','completed','rejected','cancelled')),
  pay_method    text not null check (pay_method in ('wallet','counter')),
  fee           integer not null,
  total         integer not null,
  credits_used  integer not null default 0,
  cash          integer not null default 0,
  settled       boolean not null default false,
  reaction      text,
  created_at    timestamptz not null default now()
);
create index if not exists orders_owner on orders(owner_id, created_at desc);
create index if not exists orders_bank on orders(bank_id, stage);

create table if not exists order_events (
  id       bigserial primary key,
  order_id text not null references orders(id) on delete cascade,
  stage    text not null,
  at       timestamptz not null default now(),
  note     text
);
create index if not exists order_events_order on order_events(order_id, id);

create table if not exists batches (
  id             text primary key,
  bank_id        text not null references banks(id),
  grp            text not null,
  component      text not null check (component in ('WB','PRBC','FFP','PLT','CRYO')),
  collected      timestamptz not null,
  expiry         timestamptz not null,
  status         text not null check (status in ('quarantine','available','reserved','issued','discarded')),
  source         text not null check (source in ('Voluntary','Camp','Replacement','Transfer')),
  order_id       text references orders(id) on delete set null,
  discard_reason text
);
create index if not exists batches_stock on batches(bank_id, grp, component, status, expiry);
create index if not exists batches_order on batches(order_id);

-- One wallet per account (people and centres). Balances can never go negative.
create table if not exists wallets (
  owner_id     text primary key,
  balance      integer not null default 0 check (balance >= 0),
  held         integer not null default 0 check (held >= 0),
  credits      integer not null default 0 check (credits >= 0),
  credits_held integer not null default 0 check (credits_held >= 0)
);

create table if not exists ledger (
  id       text primary key,
  owner_id text not null,
  at       timestamptz not null default now(),
  kind     text not null,
  amount   integer not null default 0,
  credits  integer not null default 0,
  note     text not null,
  ref      text
);
create index if not exists ledger_owner on ledger(owner_id, at desc);

create table if not exists profiles (
  id            text primary key references users(id) on delete cascade,
  name          text not null,
  phone         text not null,
  city          text not null,
  grp           text not null,
  age           integer not null,
  weight        numeric not null,
  sex           text not null check (sex in ('F','M')),
  last_donation timestamptz,
  donor_active  boolean not null default true,
  rare_donor    boolean not null default false,
  share_contact boolean not null default false
);

create table if not exists family_members (
  id         text primary key,
  profile_id text not null references profiles(id) on delete cascade,
  name       text not null,
  relation   text not null,
  grp        text not null
);

create table if not exists camps (
  id           text primary key,
  org          text not null,
  requested_by text not null,
  venue        text not null,
  city         text not null,
  date         timestamptz not null,
  target       integer not null,
  bank_ids     text[] not null default '{}',
  accepted_by  text references banks(id),
  status       text not null check (status in ('requested','accepted','completed','declined')),
  registered   integer not null default 0,
  collected    integer not null default 0
);

create table if not exists donations (
  id         text primary key,
  donor_id   text not null,
  donor_name text not null,
  grp        text not null,
  bank_id    text not null references banks(id),
  date       timestamptz not null,
  slot       text not null,
  status     text not null check (status in ('booked','completed','deferred','cancelled')),
  hb         numeric,
  note       text,
  camp_id    text references camps(id) on delete set null
);
create index if not exists donations_bank on donations(bank_id, date desc);
create index if not exists donations_donor on donations(donor_id);

create table if not exists donor_requests (
  id          text primary key,
  by_id       text not null,
  by_name     text not null,
  grp         text not null,
  units       integer not null,
  hospital    text not null,
  city        text not null,
  needed_by   timestamptz not null,
  note        text not null default '',
  fee_support boolean not null default false,
  responders  text[] not null default '{}',
  status      text not null check (status in ('open','fulfilled','closed')),
  broadcast   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists threads (
  id         text primary key,
  title      text not null,
  subtitle   text not null default '',
  kind       text not null check (kind in ('direct','broadcast')),
  members    text[] not null,
  updated_at timestamptz not null default now()
);
create index if not exists threads_members on threads using gin(members);

create table if not exists messages (
  id        text primary key,
  thread_id text not null references threads(id) on delete cascade,
  from_id   text not null,
  text      text not null,
  at        timestamptz not null default now()
);
create index if not exists messages_thread on messages(thread_id, at);

create table if not exists notices (
  id       text primary key,
  to_role  text not null,
  title    text not null,
  body     text not null,
  at       timestamptz not null default now(),
  read     boolean not null default false,
  link     text,
  tone     text not null check (tone in ('info','good','warn','crit')),
  owner_id text
);
create index if not exists notices_to on notices(to_role, at desc);

create table if not exists referrals (
  id      text primary key,
  bank_id text not null references banks(id),
  name    text not null,
  kind    text not null,
  city    text not null,
  plan    text not null,
  units   integer not null default 0,
  status  text not null check (status in ('active','invited')),
  contact text not null
);

create table if not exists account_entries (
  id      text primary key,
  bank_id text not null references banks(id),
  at      timestamptz not null default now(),
  kind    text not null check (kind in ('income','expense')),
  head    text not null,
  amount  integer not null,
  ref     text
);
create index if not exists account_entries_bank on account_entries(bank_id, at desc);

create table if not exists applications (
  id           text primary key,
  name         text not null,
  city         text not null,
  district     text not null,
  license      text not null,
  docs         jsonb not null default '[]',
  franchise_id text not null,
  status       text not null check (status in ('pending','approved','rejected')),
  at           timestamptz not null default now(),
  type         text not null
);

create table if not exists leads (
  id      text primary key,
  name    text not null,
  city    text not null,
  contact text not null,
  stage   text not null check (stage in ('Lead','Demo done','Documents','Live')),
  plan    text not null
);

create table if not exists tickets (
  id       text primary key,
  from_org text not null,
  subject  text not null,
  priority text not null,
  status   text not null check (status in ('open','resolved')),
  at       timestamptz not null default now()
);

create table if not exists audit (
  id     text primary key,
  at     timestamptz not null default now(),
  actor  text not null,
  action text not null,
  target text not null
);
create index if not exists audit_at on audit(at desc);

create table if not exists plans (
  id         text primary key,
  owner_id   text not null,
  patient    text not null,
  grp        text not null,
  component  text not null,
  units      integer not null,
  every_days integer not null,
  bank_id    text not null references banks(id),
  next       timestamptz not null,
  active     boolean not null default true
);

create table if not exists month_stats (
  idx       integer primary key,
  m         text not null,
  collected integer not null,
  issued    integer not null
);

create table if not exists sensors (
  id      text primary key,
  bank_id text not null references banks(id),
  name    text not null,
  kind    text not null,
  temp    numeric not null,
  min     numeric not null,
  max     numeric not null
);

-- Licensed blood centres from government data (National Health Portal / data.gov.in, State Blood
-- Transfusion Councils). A directory only: it has no stock. Restoring the sample data never touches it.
create table if not exists directory_centres (
  id            serial primary key,
  name          text not null,
  state         text not null,
  district      text not null default '',
  city          text not null default '',
  address       text not null default '',
  pincode       text not null default '',
  phone         text not null default '',
  mobile        text not null default '',
  email         text not null default '',
  website       text not null default '',
  category      text not null default '',
  components    boolean,
  apheresis     boolean,
  service_time  text not null default '',
  license       text not null default '',
  license_date  text not null default '',
  renewal_date  text not null default '',
  lat           double precision,
  lng           double precision,
  source        text not null,
  imported_at   timestamptz not null default now()
);
create index if not exists directory_place on directory_centres(lower(state), lower(district));
create index if not exists directory_license on directory_centres(lower(license));
`;

/** Every table, children before parents, for wiping during a reset. */
export const TABLES = [
  'messages', 'threads', 'order_events', 'batches', 'donations', 'family_members', 'profiles', 'orders', 'files', 'camps', 'donor_requests',
  'notices', 'referrals', 'account_entries', 'applications', 'leads', 'tickets', 'audit', 'plans', 'month_stats', 'sensors', 'ledger', 'wallets',
  'banks', 'users',
];
