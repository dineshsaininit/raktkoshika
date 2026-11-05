# Raktkoshika API (backend)

Node.js + Express 5 + MongoDB (Mongoose) + JWT. It runs the same rules as the frontend demo
(`src/store/store.tsx`) on the server and stores everything in MongoDB.

## Run it

You need Node 20+ and a MongoDB: local `mongod`, Docker
(`docker run -d -p 27017:27017 --name rk-mongo mongo:7`) or a free MongoDB Atlas cluster.

```
cd server
npm install
cp .env.example .env      # set MONGODB_URI and JWT_SECRET
npm run seed              # loads the same sample data as the frontend demo
npm run dev               # http://localhost:4000
```

Then in the repo root:

```
cp .env.example .env.local   # VITE_API_URL=http://localhost:4000
npm run dev
```

With `VITE_API_URL` set, every portal signs in to the server and reads and writes through it. Without
it, the frontend stays the browser-only demo. Open two portals in two windows: changes show up in the
other one through the live event feed.

`npm test` runs the end-to-end API tests. It starts a throwaway in-memory MongoDB (downloaded on first
run), or uses `MONGODB_TEST_URI` if you set it.

## Sample accounts

`npm run seed` creates one account per portal. Password: `SEED_PASSWORD` (default `raktkoshika123`).

| Portal | Mobile | Account |
|---|---|---|
| user | 9000000001 | Riya Kulkarni (patient / donor) |
| bank | 9000000002 | Dr. Meera Patil, Krishna Valley Blood Centre |
| referral | 9000000003 | Sanjeevani Hospital |
| franchise | 9000000004 | Vikram Jadhav |
| admin | 9000000005 | Network Ops |

## Layout

| Path | What it holds |
|---|---|
| `src/models/index.ts` | One Mongoose model per collection (21), matching `src/data/types.ts` |
| `src/services/orders.ts` | Order flow: wallet hold → prescription → sample → cross-match (FEFO reserve) → issue (settle) → handover |
| `src/services/people.ts` | Wallet, profile, donations, quarantine/discard/transfer of stock |
| `src/services/community.ts` | Camps, donor requests, chat, broadcasts, centre back office, plans, franchise, verification |
| `src/services/snapshot.ts` | `GET /api/db`: the frontend's whole `DB` object, filtered to what the account may see |
| `src/services/seed.ts` | Loads `src/data/seed.ts` into MongoDB |
| `src/routes/` | HTTP routes with input validation (zod) |
| `src/lib/auth.ts` | JWT, role checks, "own centre only" checks |

The server imports `src/data/rules.ts` (fees, compatibility, donation gaps) and `src/data/types.ts`
from the frontend, so both always use the same rules.

## API

All routes are under `/api`. Send `Authorization: Bearer <token>` except where marked public.
Errors come back as `{ "error": "message", "details": [...] }` with a 4xx status.

**Auth**

| Method | Path | Body | Who |
|---|---|---|---|
| POST | `/auth/login` | `{ phone, password }` | public |
| POST | `/auth/register` | `{ name, phone, password, city, group, sex, age, weight }` | public, creates a patient/donor |
| POST | `/auth/demo` | `{ role }` | public, only when `DEMO_LOGIN=true` |
| GET | `/auth/me` | | any |

**Data**

| Method | Path | Body | Who |
|---|---|---|---|
| GET | `/health` | | public |
| GET | `/public/stock?group=&component=&city=` | | public: in-date available units per centre |
| GET | `/db` | | any: full snapshot for the portal |
| GET | `/events?token=` | | any: server-sent events, one `change` per write |
| POST | `/orders` | `{ kind, urgency, patient, group, component, units, bankId, fulfilment, rx, method, creditsToUse, scheduledFor?, seriesId?, id? }` | user, referral |
| GET | `/orders/:id` | | owner, its centre, ops |
| POST | `/orders/:id/advance` | | bank (own centre), admin |
| POST | `/orders/:id/reject` | `{ reason }` | bank, admin |
| POST | `/orders/:id/cancel` | `{ reason }` | the owner |
| POST | `/orders/:id/reaction` | `{ text }` | the owner |
| POST | `/wallet/topup` | `{ amount, method }` | user, referral |
| POST | `/wallet/payout` | `{ amount }` | bank, franchise |
| POST | `/wallet/gift-credit` | `{ member }` | user |
| GET / PATCH | `/profile` | profile fields | user |
| POST | `/profile/family` | `{ name, relation, group }` | user |
| POST | `/donations` | `{ bankId, date, slot, campId? }` | user |
| POST | `/donations/:id/cancel` | | the donor |
| POST | `/donations/:id/record` | `{ hb }` | bank |
| POST | `/stock/release` | `{ ids }` | bank |
| POST | `/stock/:id/discard` | `{ reason }` | bank |
| POST | `/stock/:id/transfer` | `{ toBank }` | bank |
| POST | `/camps` | `{ org, venue, city, date, target, bankIds }` | any |
| POST | `/camps/:id/respond` | `{ status, bankId? }` | bank |
| POST | `/requests` | `{ group, units, hospital, city, neededBy, note, feeSupport }` | any |
| POST | `/requests/:id/respond`, `/requests/:id/close` | | any / poster |
| POST | `/threads/:id/messages` | `{ text }` | thread members |
| POST | `/broadcasts` | `{ group, city, note }` | bank, admin |
| POST | `/notices/read` | | any |
| POST | `/bank/centres`, `/bank/referrals`, `/bank/expenses` | see `routes/api.ts` | bank |
| POST | `/plans`, `/plans/:id/toggle` | | user, referral |
| POST | `/applications` | `{ name, city, license, type? }` | franchise |
| POST | `/applications/:id/decision` | `{ status }` | admin |
| POST / PATCH | `/leads`, `/leads/:id` | | franchise, admin |
| POST | `/tickets`, `/tickets/:id/resolve` | | any / ops |
| POST | `/admin/reset` | | any, only when `ALLOW_DEMO_RESET=true` |

## What the server enforces that the demo did not

- Wallet holds check the balance inside the update, so two orders cannot spend the same money. Too little money returns 402.
- Cross-match reserves only in-date units, first-expiry-first-out, and fails with 409 if stock is short.
- Each order step can run only once (a double click gets a 409), and closed orders cannot be cancelled.
- Bank staff can act only on their own centre and its branches. Users see only their own orders, wallet, chats and notices.
- Donors cannot book before their donation gap (90 days men, 120 days women) is over, or hold two bookings.

## Before production

- Turn off `DEMO_LOGIN` and `ALLOW_DEMO_RESET`, set a long `JWT_SECRET`, set `NODE_ENV=production`.
- Replace phone + password with phone + OTP (MSG91, Twilio Verify or Firebase Auth).
- `POST /wallet/topup` adds money directly. Replace it with a payment gateway (Razorpay) order, and credit the wallet only from the gateway's verified webhook.
- Money moves are several single-document writes, not one transaction. On a MongoDB replica set (Atlas is one), wrap `placeOrder`, `advanceOrder` and `closeOrder` in `mongoose.startSession().withTransaction()`.
- Prescriptions are a file name today. Add uploads to S3 / Cloudinary and store the URL.
- The live feed is in-process. With more than one server instance, use Redis pub/sub or MongoDB change streams.
- `/api/db` sends all stock and centres to every portal. Fine for one region; paginate once data grows.
