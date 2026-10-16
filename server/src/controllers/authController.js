import bcrypt from 'bcryptjs';
import { ApiError } from '../utils/ApiError.js';
import {
  db,
  findRefreshToken,
  findUserByEmail,
  findUserById,
  makeUser,
  rememberRefreshToken,
  revokeAllRefreshTokensForUser,
  revokeRefreshTokenRecord,
  sanitizeUser,
} from '../data/store.js';
import {
  decodeToken,
  revokeAccessToken,
  revokeRefreshToken,
  signRefreshToken,
  signToken,
  verifyRefreshToken,
} from '../middleware/auth.js';

/** ===== Authentication controller ===== */

/**
 * Mints an access + refresh token pair for a user.
 *
 * The refresh token is recorded in the store so the next call can rotate it
 * (single use) and logout can revoke it. Both login and register funnel through
 * here, so they always return an identical `data` shape.
 */
function issueTokens(user) {
  const token = signToken(user);
  const refreshToken = signRefreshToken(user);
  const { jti, exp } = decodeToken(refreshToken);

  rememberRefreshToken({
    jti,
    userId: user.id,
    expiresAt: new Date(exp * 1000).toISOString(),
  });

  return {
    user: sanitizeUser(user),
    token, // access token - sent back as `Authorization: Bearer <token>`
    refreshToken, // exchange at POST /api/auth/refresh to get a new pair
    tokenType: 'Bearer',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  };
}

/**
 * POST /api/auth/register -> 201 Created
 *
 * When the email is already taken we answer 409 Conflict (not 400), because
 * the payload is valid - it just clashes with the current state of the server.
 *
 * Note: the handlers are synchronous on purpose. Express 4 does not forward
 * rejected promises to the error handler, so a `throw` inside an `async`
 * function would hang the request instead of returning a JSON error.
 * (Express 5 handles async handlers natively.)
 */
export function register(req, res) {
  const { name, email, password, role } = req.body;

  if (findUserByEmail(email)) {
    throw ApiError.conflict(`An account already exists for "${email}"`, 'EMAIL_IN_USE');
  }

  const user = makeUser({ name, email, password, role: role ?? 'user' });
  db.users.push(user);

  res.status(201).location(`/api/users/${user.id}`).json({
    message: 'Account created',
    data: issueTokens(user),
  });
}

/**
 * POST /api/auth/login -> 200 OK
 *
 * A wrong email and a wrong password deliberately return the *same* 401
 * message so the endpoint cannot be used to discover which emails exist.
 */
export function login(req, res) {
  const { email, password } = req.body;
  const user = findUserByEmail(email);

  // compareSync (not compare) keeps this handler synchronous - see the note above.
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  res.status(200).json({ message: 'Logged in', data: issueTokens(user) });
}

/**
 * POST /api/auth/refresh -> 200 OK
 *
 * Exchanges a valid refresh token for a brand-new pair. Refresh tokens are
 * single use: the presented one is revoked as it is rotated, so a token that
 * shows up twice signals a leak and every session for the account is dropped.
 */
export function refresh(req, res) {
  const { refreshToken } = req.body;

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (error) {
    throw ApiError.unauthorized(
      'Refresh token is missing, expired or invalid. Log in again.',
      error.name === 'TokenExpiredError' ? 'REFRESH_TOKEN_EXPIRED' : 'INVALID_REFRESH_TOKEN',
    );
  }

  // Same JWT machinery, different purpose - an access token is not accepted here.
  if (payload.type !== 'refresh') {
    throw ApiError.unauthorized('That token is not a refresh token.', 'INVALID_REFRESH_TOKEN');
  }

  const record = findRefreshToken(payload.jti);
  const user = findUserById(payload.sub);

  if (!record || !user) {
    throw ApiError.unauthorized(
      'This refresh token is no longer valid. Log in again.',
      'INVALID_REFRESH_TOKEN',
    );
  }

  // Already rotated (or revoked at logout) and now replayed -> assume the token
  // leaked and revoke the whole family for this user.
  if (record.revokedAt) {
    revokeAllRefreshTokensForUser(user.id);
    throw ApiError.unauthorized(
      'This refresh token has already been used. All sessions for this account were revoked.',
      'REFRESH_TOKEN_REUSED',
    );
  }

  revokeRefreshTokenRecord(payload.jti, 'rotated'); // single use

  res.status(200).json({ message: 'Token refreshed', data: issueTokens(user) });
}

/**
 * POST /api/auth/logout -> 200 OK
 *
 * Revokes both credentials: the access token from the `Authorization` header is
 * blacklisted, and the refresh token from the body is revoked.
 *
 * This route deliberately does NOT require a valid access token - a session
 * whose short-lived access token already expired must still be closable - and
 * it is idempotent, so logging out twice is not an error.
 */
export function logout(req, res) {
  const revoked = [];

  const header = req.get('authorization') || '';
  const [scheme, accessToken] = header.split(' ');
  if (accessToken && scheme?.toLowerCase() === 'bearer' && revokeAccessToken(accessToken)) {
    revoked.push('accessToken');
  }

  const { refreshToken } = req.body ?? {};
  if (refreshToken && revokeRefreshToken(refreshToken)) {
    revoked.push('refreshToken');
  }

  res.status(200).json({ message: 'Logged out', data: { revoked } });
}

/**
 * GET /api/auth/me -> 200 OK
 * The route is protected by `authenticate`, so reaching this handler already
 * proves the token is valid (authenticated).
 */
export function me(req, res) {
  const user = findUserById(req.user.id);
  res.status(200).json({
    data: { user: sanitizeUser(user) },
    meta: {
      roles: ['user', 'admin'],
      permissions: user.role === 'admin' ? ['read', 'create', 'update', 'delete'] : ['read'],
    },
  });
}
