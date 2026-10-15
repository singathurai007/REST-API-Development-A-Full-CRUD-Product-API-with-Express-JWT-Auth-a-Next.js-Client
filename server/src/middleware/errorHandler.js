import { ApiError } from '../utils/ApiError.js';

/** ===== Error responses ===== */

/**
 * Runs when no route matched -> 404 with the standard envelope, so clients
 * never receive Express' default HTML error page.
 */
export function notFoundHandler(req, res, next) {
  next(new ApiError(404, 'ROUTE_NOT_FOUND', `Cannot ${req.method} ${req.originalUrl}`));
}

/**
 * Central error handler (Express identifies it by its 4 arguments).
 *
 * Every failure - thrown in a controller, produced by a middleware, or raised
 * by Express itself - is normalised into one JSON shape:
 *
 *   {
 *     "error": {
 *       "status": 422,
 *       "code": "VALIDATION_ERROR",
 *       "message": "…",
 *       "details": [ { "in": "body", "field": "price", "message": "…" } ],
 *       "path": "/api/products",
 *       "method": "POST",
 *       "timestamp": "2026-01-01T00:00:00.000Z"
 *     }
 *   }
 */
export function errorHandler(err, req, res, next) {
  let error = err;

  if (err instanceof SyntaxError && 'body' in err) {
    // express.json() throws this when the request body is not valid JSON.
    error = new ApiError(400, 'INVALID_JSON', 'Request body contains malformed JSON', [
      { in: 'body', field: 'body', message: err.message },
    ]);
  } else if (err?.type === 'entity.too.large') {
    error = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the 1mb limit');
  } else if (err?.type === 'entity.unsupported') {
    error = new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported request body encoding');
  } else if (!(err instanceof ApiError)) {
    // Anything that is not an ApiError is a bug: log it, hide the internals.
    error = new ApiError(
      Number.isInteger(err?.status) ? err.status : 500,
      'INTERNAL_ERROR',
      'Something went wrong on the server',
    );
    error.expose = false;
  }

  const status = error.status ?? 500;

  if (error.allowed?.length) {
    res.set('Allow', error.allowed.join(', '));
  }

  if (status >= 500) {
    console.error('[error-handler]', err);
  }

  res.status(status).json({
    error: {
      status,
      code: error.code ?? 'INTERNAL_ERROR',
      message:
        error.expose === false
          ? 'Something went wrong on the server'
          : (error.message ?? 'Unexpected error'),
      ...(error.details?.length ? { details: error.details } : {}),
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
    },
  });
}

export default errorHandler;
