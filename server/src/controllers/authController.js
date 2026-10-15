import bcrypt from 'bcryptjs';
import { ApiError } from '../utils/ApiError.js';
import { db, findUserByEmail, findUserById, makeUser, sanitizeUser } from '../data/store.js';
import { signToken } from '../middleware/auth.js';

/** ===== Authentication controller ===== */

/** Serialises a login/register response so both endpoints look identical. */
function buildAuthResponse(user) {
  return {
    user: sanitizeUser(user),
    token: signToken(user),
    tokenType: 'Bearer',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
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
    data: buildAuthResponse(user),
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

  res.status(200).json({ message: 'Logged in', data: buildAuthResponse(user) });
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
