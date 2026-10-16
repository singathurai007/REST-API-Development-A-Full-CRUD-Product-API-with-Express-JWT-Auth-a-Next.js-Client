import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/ApiError.js';
import {
  blacklistAccessToken,
  findUserById,
  isAccessTokenRevoked,
  revokeRefreshTokenRecord,
  sanitizeUser,
} from '../data/store.js';

/**
 * ===== Authentication & authorisation =====
 *
 * Authentication ("who are you?") -> `authenticate`
 * Authorisation  ("what may you do?") -> `authorize(...roles)`
 *
 * Two kinds of stateless JWT work together:
 *
 *   access token   short-lived, sent as `Authorization: Bearer <token>`
 *                  payload = { sub, email, role, type: 'access', jti, iat, exp, iss }
 *
 *   refresh token  long-lived, exchanged at POST /auth/refresh for a new pair
 *                  payload = { sub, type: 'refresh', jti, iat, exp, iss }
 *
 * Both carry a unique `jti` (JWT id) so a single token can be revoked:
 *   * logout blacklists the access token's `jti`        -> `revokeAccessToken`
 *   * logout / rotation revokes the refresh token's jti -> `revokeRefreshToken`
 */

const getSecret = () => process.env.JWT_SECRET || 'dev-only-secret-change-me';
const getExpiresIn = () => process.env.JWT_EXPIRES_IN || '1h';

// Refresh tokens are signed with their own secret, so an access token can
// never be replayed as a refresh token (or the other way round).
const getRefreshSecret = () => process.env.JWT_REFRESH_SECRET || `${getSecret()}:refresh`;
const getRefreshExpiresIn = () => process.env.JWT_REFRESH_EXPIRES_IN || '7d';

const TOKEN_ISSUER = 'rest-api-project';
const ACCESS = 'access';
const REFRESH = 'refresh';

/** Creates a signed access token for a user record. */
export function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, type: ACCESS },
    getSecret(),
    { expiresIn: getExpiresIn(), issuer: TOKEN_ISSUER, jwtid: randomUUID() },
  );
}

/** Creates a signed refresh token for a user record. */
export function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, type: REFRESH },
    getRefreshSecret(),
    { expiresIn: getRefreshExpiresIn(), issuer: TOKEN_ISSUER, jwtid: randomUUID() },
  );
}

/** Reads a token's claims without checking the signature or the expiry. */
export function decodeToken(token) {
  return jwt.decode(token);
}

/** Verifies a refresh token's signature + expiry and returns its claims. */
export function verifyRefreshToken(token) {
  return jwt.verify(token, getRefreshSecret(), { issuer: TOKEN_ISSUER });
}

/**
 * Revokes the refresh token identified by its raw value so it can no longer be
 * exchanged for a new pair. Returns true when a matching record was revoked.
 */
export function revokeRefreshToken(token) {
  try {
    const payload = jwt.verify(token, getRefreshSecret(), { issuer: TOKEN_ISSUER });
    if (payload.type !== REFRESH || !payload.jti) return false;
    return Boolean(revokeRefreshTokenRecord(payload.jti));
  } catch {
    return false; // already expired or forged - nothing to revoke
  }
}

/**
 * Blacklists the access token identified by its raw value so it stops working
 * before its `exp` - this is what makes logout take effect immediately.
 * Returns true when the token was verifiable and got blacklisted.
 */
export function revokeAccessToken(token) {
  try {
    const payload = jwt.verify(token, getSecret(), { issuer: TOKEN_ISSUER });
    if (!payload.jti) return false;
    return blacklistAccessToken({
      jti: payload.jti,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    });
  } catch {
    return false; // expired or forged - it is unusable anyway
  }
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

    // A refresh token is not an access token, even though both are JWTs.
    if (payload.type === REFRESH) {
      return next(
        ApiError.unauthorized(
          'A refresh token cannot be used as an access token. Send it to POST /api/auth/refresh instead.',
          'INVALID_TOKEN',
        ),
      );
    }

    // Revoked at logout: the signature is still fine, but the session ended.
    if (isAccessTokenRevoked(payload.jti)) {
      return next(
        ApiError.unauthorized('This access token was revoked by logout.', 'TOKEN_REVOKED'),
      );
    }

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
