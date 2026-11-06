import 'dotenv/config';

const bool = (v: string | undefined, d: boolean) => (v === undefined ? d : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()));

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  /** One-click sign-in as a sample account, without a password. Off unless switched on. */
  demoLogin: bool(process.env.DEMO_LOGIN, false),
  /** Lets an admin account restore the sample data. */
  allowReset: bool(process.env.ALLOW_DEMO_RESET, !isProd),
  /** Loads the sample data on first start when the database is empty. */
  seedIfEmpty: bool(process.env.SEED_IF_EMPTY, true),
  /** Serves the built frontend (../dist) from the same server, so one Render service hosts everything. */
  serveFrontend: bool(process.env.SERVE_FRONTEND, isProd),
  /**
   * Render's free plan sleeps after 15 minutes without traffic. When this is set (Render sets
   * RENDER_EXTERNAL_URL itself), the server calls its own health check every 14 minutes.
   */
  keepAliveUrl: process.env.KEEP_ALIVE_URL ?? process.env.RENDER_EXTERNAL_URL ?? '',
  keepAliveMinutes: Number(process.env.KEEP_ALIVE_MINUTES ?? 14),
};

if (isProd && (config.jwtSecret === 'dev-only-secret' || config.jwtSecret === 'change-me' || config.jwtSecret.length < 32)) {
  throw new Error('Set JWT_SECRET to a long random value (32+ characters) before running in production.');
}
