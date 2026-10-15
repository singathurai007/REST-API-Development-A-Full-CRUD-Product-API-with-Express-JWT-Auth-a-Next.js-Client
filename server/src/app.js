import express from 'express';
import cors from 'cors';
import { seed } from './data/store.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { requestLogger } from './middleware/requestLogger.js';
import routes from './routes/index.js';

/**
 * Builds the Express application.
 *
 * Middleware order matters - requests travel through this list top to bottom:
 *   1. cors        - answer browser preflights / set CORS headers
 *   2. json parser - turn the raw body into `req.body`
 *   3. logger      - log method, path, status and duration
 *   4. rate limit  - 429 when an IP is too chatty
 *   5. routes      - /api/*
 *   6. 404         - nothing matched
 *   7. errorHandler- normalise every failure into the JSON error envelope
 *
 * @param {{ logRequests?: boolean }} [options]
 */
export function createApp({ logRequests = process.env.NODE_ENV !== 'test' } = {}) {
  // Idempotent: loads the demo users/products the first time only.
  seed();

  const app = express();

  // Do not advertise the framework, and trust JSON errors from express.json.
  app.disable('x-powered-by');

  const allowedOrigins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // --- 1. CORS: lets the Next.js app on :3000 call this API on :4000 ------
  app.use(
    cors({
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Location', 'X-Total-Count', 'RateLimit-Limit', 'RateLimit-Remaining'],
    }),
  );

  // --- 2. Body parsing: JSON only, 1mb cap -------------------------------
  // Malformed JSON is turned into a 400 INVALID_JSON by the error handler.
  app.use(express.json({ limit: '1mb' }));

  // --- 3. Observability --------------------------------------------------
  if (logRequests) {
    app.use(requestLogger);
  }

  // --- 4. Abuse protection ----------------------------------------------
  app.use(
    createRateLimiter({
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
      max: Number(process.env.RATE_LIMIT_MAX ?? 300),
    }),
  );

  // --- 5. Application routes --------------------------------------------
  app.use('/api', routes);

  // --- 6 & 7. Fallbacks --------------------------------------------------
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
