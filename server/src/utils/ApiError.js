/**
 * ApiError is the single error type thrown by controllers.
 *
 * Having one error class means every failure ends up in the central error
 * handler (`middleware/errorHandler.js`) and is serialised into the *same*
 * JSON error envelope, so API clients only ever have to parse one shape.
 *
 *   {
 *     "error": {
 *       "status": 422,
 *       "code": "VALIDATION_ERROR",
 *       "message": "Request validation failed",
 *       "details": [ ... ],
 *       "path": "/api/products",
 *       "method": "POST",
 *       "timestamp": "2026-01-01T00:00:00.000Z"
 *     }
 *   }
 */
export class ApiError extends Error {
  /**
   * @param {number} status        HTTP status code (400, 401, 403, 404, 409, 422, ...)
   * @param {string} code          machine-readable error code, SCREAMING_SNAKE_CASE
   * @param {string} message       human-readable message shown to the client
   * @param {Array}  [details]     optional list of per-field / per-item problems
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    // Marks the error as safe to expose to the caller. Errors that are NOT
    // ApiError instances are treated as bugs and hidden behind a generic 500.
    this.expose = true;
    Error.captureStackTrace?.(this, ApiError);
  }

  // ---- Small factory helpers keep controllers short and readable ----------

  /** 400 - the request itself is malformed (e.g. broken JSON, bad id format). */
  static badRequest(message, code = 'BAD_REQUEST', details) {
    return new ApiError(400, code, message, details);
  }

  /** 401 - "who are you?" (no token, bad token, bad credentials). */
  static unauthorized(message = 'Authentication required', code = 'AUTH_REQUIRED') {
    return new ApiError(401, code, message);
  }

  /** 403 - "I know who you are, but you may not do this". */
  static forbidden(message = 'You do not have permission to perform this action', code = 'FORBIDDEN') {
    return new ApiError(403, code, message);
  }

  /** 404 - the addressed resource does not exist. */
  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new ApiError(404, code, message);
  }

  /** 405 - the resource exists but not for this HTTP method. */
  static methodNotAllowed(allowed, message) {
    const err = new ApiError(
      405,
      'METHOD_NOT_ALLOWED',
      message ?? `Method not allowed on this endpoint. Allowed: ${allowed.join(', ')}`,
    );
    err.allowed = allowed; // surfaced as the `Allow` response header
    return err;
  }

  /** 409 - the request conflicts with the current state of the server. */
  static conflict(message, code = 'CONFLICT') {
    return new ApiError(409, code, message);
  }

  /** 422 - syntactically fine JSON, but semantically invalid. */
  static validation(details, message = 'Request validation failed') {
    return new ApiError(422, 'VALIDATION_ERROR', message, details);
  }

  /** 429 - too many requests. */
  static tooManyRequests(message = 'Too many requests, please slow down') {
    return new ApiError(429, 'RATE_LIMITED', message);
  }
}

export default ApiError;
