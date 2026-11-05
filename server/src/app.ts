import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.ts';
import { errorHandler, notFoundHandler } from './lib/http.ts';
import { api } from './routes/api.ts';
import { auth } from './routes/auth.ts';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: false }));
  app.use(express.json({ limit: '200kb' }));
  if (!config.isProd) app.use((req, _res, next) => { if (req.path !== '/api/events') console.log(`${req.method} ${req.path}`); next(); });

  app.get('/', (_req, res) => { res.json({ name: 'Raktkoshika API', docs: 'See server/README.md', health: '/api/health' }); });
  app.use('/api/auth', auth);
  app.use('/api', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
