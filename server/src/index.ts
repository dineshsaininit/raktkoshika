import { config } from './config.ts';
import { connectDb, disconnectDb } from './db.ts';
import { createApp } from './app.ts';

await connectDb();
const server = createApp().listen(config.port, () => {
  console.log(`[api] listening on http://localhost:${config.port}`);
  if (config.demoLogin) console.log('[api] demo sign-in is ON (DEMO_LOGIN). Turn it off in production.');
});

const stop = async (sig: string) => {
  console.log(`[api] ${sig}, shutting down`);
  server.close();
  await disconnectDb();
  process.exit(0);
};
process.on('SIGINT', () => void stop('SIGINT'));
process.on('SIGTERM', () => void stop('SIGTERM'));
