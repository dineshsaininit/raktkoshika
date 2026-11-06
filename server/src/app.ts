import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.ts';
import { errorHandler, notFoundHandler } from './lib/http.ts';
import { api } from './routes/api.ts';
import { auth } from './routes/auth.ts';

/** The built frontend (`npm run build` in the repo root writes it to ../dist). */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"], 'img-src': ["'self'", 'data:', 'blob:'], 'style-src': ["'self'", "'unsafe-inline'"],
        'font-src': ["'self'", 'data:'], 'connect-src': ["'self'"], 'frame-src': ["'self'", 'blob:'], 'object-src': ["'self'", 'blob:'],
      },
    },
  }));
  app.use(cors({ origin: config.corsOrigin, credentials: false }));
  // Prescriptions arrive as base64 (up to 3 MB of file), so this one route accepts a larger body.
  app.use('/api/files', express.json({ limit: '5mb' }));
  app.use(express.json({ limit: '200kb' }));
  if (!config.isProd) app.use((req, _res, next) => { if (req.path.startsWith('/api') && req.path !== '/api/events') console.log(`${req.method} ${req.path}`); next(); });

  app.use('/api/auth', auth);
  app.use('/api', api);
  app.use('/api', notFoundHandler);

  if (config.serveFrontend && fs.existsSync(path.join(DIST, 'index.html'))) {
    app.use(express.static(DIST, { index: false, maxAge: '1h', setHeaders: (res, file) => { if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); } }));
    // The app uses hash routes, so every other path is the single page.
    app.get(/^\/(?!api\/).*/, (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(DIST, 'index.html')); });
  } else {
    app.get('/', (_req, res) => { res.json({ name: 'Raktkoshika API', health: '/api/health', note: 'Run `npm run build` in the repo root to serve the website from here.' }); });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
