import 'dotenv/config';

const bool = (v: string | undefined, d: boolean) => (v === undefined ? d : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()));

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/raktkoshika',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
  demoLogin: bool(process.env.DEMO_LOGIN, !isProd),
  allowReset: bool(process.env.ALLOW_DEMO_RESET, !isProd),
  seedPassword: process.env.SEED_PASSWORD ?? 'raktkoshika123',
};

if (isProd && (config.jwtSecret === 'dev-only-secret' || config.jwtSecret === 'change-me')) {
  throw new Error('Set JWT_SECRET to a long random value before running in production.');
}
