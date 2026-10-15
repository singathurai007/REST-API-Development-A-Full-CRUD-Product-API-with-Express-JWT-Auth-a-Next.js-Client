import { ApiError } from '../utils/ApiError.js';

/** ===== 405 helper ===== */

/**
 * Responds with 405 Method Not Allowed and an `Allow` header.
 *
 * Registered *after* the real verb handlers on a route, so Express falls
 * through to it only for methods the resource does not support - e.g.
 * `DELETE /api/products` (use `DELETE /api/products/:id` instead).
 *
 * @param {string[]} allowed HTTP methods this resource supports
 */
export function methodNotAllowed(allowed) {
  return function methodNotAllowedMiddleware(req, res, next) {
    return next(ApiError.methodNotAllowed(allowed));
  };
}

export default methodNotAllowed;
