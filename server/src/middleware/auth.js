import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/ApiError.js';
import { findUserById, sanitizeUser } from '../data/store.js';

/**
 * ===== Authentication & authorisation =====
 *
 * Authentication ("who are you?") -> `authenticate`
 * Authorisation  ("what may you do?") -> `authorize(...roles)`
 *
 * Tokens are stateless JWTs sent as `Authorization: Bearer <token>`.
 *   payload = { sub: <user id>, email, role, iat, exp, iss }
 */

const getSecret = () => process.env.JWT_SECRET || 'dev-only-secret-change-me';
const getExpiresIn = () => process.env.JWT_EXPIRES_IN || '1h';

const TOKEN_ISSUER = 'rest-api-project';

/** Creates a signed access token for a user record. */
export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    getSecret(),
    { expiresIn: getExpiresIn(), issuer: TOKEN_ISSUER },
  );
}

/**
 * Reads `Authorization: Bearer <token>` and, when valid, attaches the matching
 * user to `req.user` (without the password hash). Rejects with 401 otherwise.
 */
export function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');

  if (!token || scheme.toLowerCase() !== 'bearer') {
    return next(
      ApiError.unauthorized(
        'Missing access token. Send an "Authorization: Bearer <token>" header.',
        'AUTH_REQUIRED',
      ),
    );
  }

  try {
    const payload = jwt.verify(token, getSecret(), { issuer: TOKEN_ISSUER });
    const user = findUserById(payload.sub);

    if (!user) {
      return next(
        ApiError.unauthorized('The token is valid but the user no longer exists', 'INVALID_TOKEN'),
      );
    }

    req.user = sanitizeUser(user);
    req.auth = { token, payload };
    return next();
  } catch (error) {
    const code = error.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    const message =
      error.name === 'TokenExpiredError'
        ? 'Access token has expired. Log in again to get a new one.'
        : `Access token could not be verified (${error.message}).`;
    return next(ApiError.unauthorized(message, code));
  }
}

/**
 * Role gate. Runs *after* `authenticate`, so `req.user` always exists here.
 *
 *   router.post('/', authorize('admin'), controller)   // 403 for a plain user
 */
export function authorize(...allowedRoles) {
  return function authorizeMiddleware(req, res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `Role "${req.user.role}" is not allowed to perform this action. Requires: ${allowedRoles.join(' or ')}.`,
        ),
      );
    }

    return next();
  };
}

export default authenticate;
