# Raktkoshika: digital blood bank network

A website with five portals (patient & donor, blood centre, hospital/doctor, franchise, HQ admin), backed by a
Node.js API and a Postgres database (Neon). All people, centres, stock and payments in the sample data are
fictional. Payments are test payments: no real money moves.

## Run it on your computer

You need Node.js 20 or newer and a Postgres connection string (your Neon database).

```
# 1. API (creates the tables and loads sample data on first start)
cd server
npm install
copy .env.example .env        # then put your DATABASE_URL and a long JWT_SECRET in .env
npm run dev                   # http://localhost:4000

# 2. Website, in a second terminal from the project root
npm install
copy .env.example .env.local  # VITE_API_URL=http://localhost:4000
npm run dev                   # open the address it prints, usually http://localhost:5173
```

Without `VITE_API_URL` the website runs as a browser-only demo, with no server or database.

Useful commands in `server/`:

| Command | What it does |
|---|---|
| `npm run seed` | Wipes the database and reloads the sample data |
| `npm test` | 31 end-to-end API tests. They use a separate database (`<name>_test`) because they wipe it |
| `npm run typecheck` | Type-checks the server |

## Sign-ins (sample data)

| Portal | Mobile | Password | Account |
|---|---|---|---|
| Patient & donor | 9000000001 | Patient@123 | Riya Kulkarni: orders, wallet, 2 donor credits |
| Patient & donor | 9000000006 | Donor@123 | Arjun Deshmukh: new donor, eligible today |
| Blood centre | 9000000002 | Centre@123 | Dr. Meera Patil, Krishna Valley Blood Centre |
| Blood centre | 9000000007 | Civic@123 | Dr. Anand Kamble, Miraj Civic Blood Centre |
| Hospital / doctor | 9000000003 | Hospital@123 | Dr. Sameer Joshi, Sanjeevani Hospital |
| Hospital / doctor | 9000000009 | Clinic@123 | Dr. A. Gokhale, Lifeline Clinic |
| Franchise | 9000000004 | Franchise@123 | Vikram Jadhav, South Maharashtra franchise |
| HQ admin | 9000000005 | Admin@123 | Network Ops, Raktkoshika HQ |

The same list lives in `src/data/demoAccounts.ts`, and the sign-in page shows it. Anyone can also create a
patient/donor account from the sign-in page.

## Host it on Render

The repository includes `render.yaml`, which sets up one free web service that serves the website and the API
together, in the Singapore region next to the Neon database.

1. Push this repository to GitHub.
2. In Render: **New → Blueprint**, choose the repository.
3. When asked for `DATABASE_URL`, paste your Neon connection string. Render generates `JWT_SECRET` itself.
4. Deploy. The first start creates every table and loads the sample data.

**Keep-alive.** Render's free plan puts a service to sleep after 15 minutes without visitors. The server calls
its own `/api/health` every 14 minutes (using the `RENDER_EXTERNAL_URL` that Render provides), so it stays awake.
That health check does not touch the database, so Neon can still pause when nobody is using the site.
One always-on free service uses about 730 of the 750 free hours Render gives each month, so keep only one
free service awake.

## Layout

| Path | What it holds |
|---|---|
| `src/` | Website (React + Vite): pages for each portal, shared rules in `src/data/rules.ts` |
| `src/api/client.ts` | Sign-in, sign-up, file uploads, live change feed |
| `src/store/store.tsx` | Every action; in API mode each one is sent to the server |
| `server/src/db/schema.ts` | All Postgres tables, created automatically |
| `server/src/services/` | Orders and wallet (in database transactions), donations, stock, community, snapshot, seed |
| `server/src/routes/` | HTTP API with input validation |
| `render.yaml` | Render deployment |

## Before real patients or money

- Set `ALLOW_DEMO_RESET=false` and `VITE_SHOW_DEMO_LOGINS=false`, and replace the sample accounts.
- Add a payment gateway (for example Razorpay). Today "Add money" is a test top-up.
- Replace password sign-in with mobile OTP once an SMS provider is chosen.
- Get legal advice on the wallet (RBI rules for stored balances), donor credits, and health data (DPDP Act).
- Confirm processing charges in `src/data/rules.ts` against the current NBTC circular, and the register formats
  with your State FDA and SBTC.
