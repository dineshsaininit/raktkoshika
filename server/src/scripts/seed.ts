import { DEMO_ACCOUNTS } from '../../../src/data/demoAccounts.ts';
import { connectDb, disconnectDb } from '../db.ts';
import { seedDatabase } from '../services/seed.ts';

/** Creates the tables (if missing), wipes them, and loads the sample network. */
await connectDb();
const r = await seedDatabase();
console.log(`[seed] loaded ${r.banks} centres, ${r.batches} blood units, ${r.orders} orders`);
console.log('[seed] sign-ins:');
for (const a of DEMO_ACCOUNTS) console.log(`        ${a.role.padEnd(10)} ${a.phone}  ${a.password.padEnd(14)} ${a.name}, ${a.org}`);
await disconnectDb();
