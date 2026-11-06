import { config } from './config.ts';
import { connectDb, disconnectDb } from './db.ts';
import { createApp } from './app.ts';
import { isEmpty, seedDatabase } from './services/seed.ts';

await connectDb(); // also creates any missing tables
if (config.seedIfEmpty && (await isEmpty())) {
  const r = await seedDatabase();
  console.log(`[seed] empty database, loaded sample data: ${r.accounts} sign-ins, ${r.banks} centres, ${r.batches} units, ${r.orders} orders`);
}

const server = createApp().listen(config.port, () => {
  console.log(`[api] listening on http://localhost:${config.port}`);
  if (config.demoLogin) console.log('[api] password-free demo sign-in is ON (DEMO_LOGIN). Turn it off for a public site.');
});

/**
 * Keep-alive for Render's free plan, which sleeps a service after 15 minutes without incoming traffic.
 * The request goes out to the public URL and comes back in through Render, so it counts as traffic.
 * /api/health does not touch the database, so Neon can still pause its compute while the site is idle.
 */
let keepAlive: ReturnType<typeof setInterval> | undefined;
if (config.keepAliveUrl) {
  const url = `${config.keepAliveUrl.replace(/\/$/, '')}/api/health`;
  const ping = async () => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      console.log(`[keep-alive] ${r.status} ${url}`);
    } catch (e) {
      console.warn(`[keep-alive] failed: ${(e as Error).message}`);
    }
  };
  keepAlive = setInterval(ping, config.keepAliveMinutes * 60_000);
  console.log(`[keep-alive] pinging ${url} every ${config.keepAliveMinutes} minutes`);
}

const stop = async (sig: string) => {
  console.log(`[api] ${sig}, shutting down`);
  clearInterval(keepAlive);
  server.close();
  await disconnectDb();
  process.exit(0);
};
process.on('SIGINT', () => void stop('SIGINT'));
process.on('SIGTERM', () => void stop('SIGTERM'));
