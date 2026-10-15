import rateLimit from 'express-rate-limit';
import { ApiError } from '../utils/ApiError.js';

/** ===== Rate limiting (429 Too Many Requests) ===== */

/**
 * Builds the limiter used by the API. A throttled request gets the *same* JSON
 * error envelope as every other failure in this project, instead of the
 * library's plain-text default.
 *
 * Response headers `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`
 * are added automatically thanks to `standardHeaders: 'draft-7'`.
 *
 * @param {{ windowMs: number, max: number }} options
 */
export function createRateLimiter({ windowMs, max }) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      const error = ApiError.tooManyRequests(
        `Too many requests from ${req.ip}. Limit: ${max} requests per ${Math.round(windowMs / 1000)}s.`,
      );
      res.status(429).json({
        error: {
          status: error.status,
          code: error.code,
          message: error.message,
          path: req.originalUrl,
          method: req.method,
          timestamp: new Date().toISOString(),
        },
      });
    },
  });
}

export default createRateLimiter;
