import { config } from '../config.ts';
import { connectDb, disconnectDb } from '../db.ts';
import { DEMO_PHONES, seedDatabase } from '../services/seed.ts';

await connectDb();
const r = await seedDatabase();
console.log(`[seed] loaded ${r.banks} centres, ${r.batches} blood units, ${r.orders} orders`);
console.log(`[seed] demo sign-ins (password: ${config.seedPassword})`);
for (const [role, phone] of Object.entries(DEMO_PHONES)) console.log(`        ${role.padEnd(10)} ${phone}`);
await disconnectDb();
