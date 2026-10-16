import { ROLES } from '../data/store.js';

/** ===== Validation schemas for the authentication endpoints ===== */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NAME_MIN = 2;
const NAME_MAX = 80;
const EMAIL_MAX = 254;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72; // bcrypt silently truncates beyond 72 bytes

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isMissing = (value) =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

/** Validates + normalises the POST /api/auth/register body. */
export function validateRegister(payload = {}) {
  const errors = [];
  const value = {};

  if (!isPlainObject(payload)) {
    return { value: {}, errors: [{ field: 'body', message: 'request body must be a JSON object' }] };
  }

  // ---- name ----
  if (isMissing(payload.name)) {
    errors.push({ field: 'name', message: 'name is required' });
  } else if (typeof payload.name !== 'string') {
    errors.push({ field: 'name', message: 'name must be a string' });
  } else {
    const name = payload.name.trim();
    if (name.length < NAME_MIN) {
      errors.push({ field: 'name', message: `name must be at least ${NAME_MIN} characters long` });
    } else if (name.length > NAME_MAX) {
      errors.push({ field: 'name', message: `name must be at most ${NAME_MAX} characters long` });
    } else {
      value.name = name;
    }
  }

  // ---- email ----
  if (isMissing(payload.email)) {
    errors.push({ field: 'email', message: 'email is required' });
  } else if (typeof payload.email !== 'string') {
    errors.push({ field: 'email', message: 'email must be a string' });
  } else {
    const email = payload.email.trim().toLowerCase();
    if (email.length > EMAIL_MAX) {
      errors.push({ field: 'email', message: `email must be at most ${EMAIL_MAX} characters long` });
    } else if (!EMAIL_RE.test(email)) {
      errors.push({ field: 'email', message: 'email must be a valid email address' });
    } else {
      value.email = email;
    }
  }

  // ---- password ----
  if (isMissing(payload.password)) {
    errors.push({ field: 'password', message: 'password is required' });
  } else if (typeof payload.password !== 'string') {
    errors.push({ field: 'password', message: 'password must be a string' });
  } else if (payload.password.length < PASSWORD_MIN) {
    errors.push({ field: 'password', message: `password must be at least ${PASSWORD_MIN} characters long` });
  } else if (payload.password.length > PASSWORD_MAX) {
    errors.push({ field: 'password', message: `password must be at most ${PASSWORD_MAX} characters long` });
  } else if (!/[A-Za-z]/.test(payload.password) || !/[0-9]/.test(payload.password)) {
    errors.push({ field: 'password', message: 'password must contain at least one letter and one number' });
  } else {
    value.password = payload.password;
  }

  // ---- role: optional, defaults to "user" ----
  if (payload.role !== undefined) {
    const role = String(payload.role).trim().toLowerCase();
    if (!ROLES.includes(role)) {
      errors.push({ field: 'role', message: `role must be one of: ${ROLES.join(', ')}` });
    } else {
      value.role = role;
    }
  }

  return { value, errors };
}

/** Validates + normalises the POST /api/auth/login body. */
export function validateLogin(payload = {}) {
  const errors = [];
  const value = {};

  if (!isPlainObject(payload)) {
    return { value: {}, errors: [{ field: 'body', message: 'request body must be a JSON object' }] };
  }

  if (isMissing(payload.email)) {
    errors.push({ field: 'email', message: 'email is required' });
  } else if (typeof payload.email !== 'string') {
    errors.push({ field: 'email', message: 'email must be a string' });
  } else {
    value.email = payload.email.trim().toLowerCase();
  }

  if (isMissing(payload.password)) {
    errors.push({ field: 'password', message: 'password is required' });
  } else if (typeof payload.password !== 'string') {
    errors.push({ field: 'password', message: 'password must be a string' });
  } else {
    value.password = payload.password;
  }

  return { value, errors };
}

/** Validates + normalises the POST /api/auth/refresh body. */
export function validateRefresh(payload = {}) {
  const errors = [];
  const value = {};

  if (!isPlainObject(payload)) {
    return { value: {}, errors: [{ field: 'body', message: 'request body must be a JSON object' }] };
  }

  if (isMissing(payload.refreshToken)) {
    errors.push({ field: 'refreshToken', message: 'refreshToken is required' });
  } else if (typeof payload.refreshToken !== 'string') {
    errors.push({ field: 'refreshToken', message: 'refreshToken must be a string' });
  } else {
    value.refreshToken = payload.refreshToken.trim();
  }

  return { value, errors };
}

/**
 * Validates + normalises the POST /api/auth/logout body.
 * The body is optional: logout is idempotent, so `{}` is a valid request.
 */
export function validateLogout(payload = {}) {
  const errors = [];
  const value = {};

  if (!isPlainObject(payload)) {
    return { value: {}, errors: [{ field: 'body', message: 'request body must be a JSON object' }] };
  }

  if (payload.refreshToken !== undefined && payload.refreshToken !== null) {
    if (typeof payload.refreshToken !== 'string') {
      errors.push({ field: 'refreshToken', message: 'refreshToken must be a string' });
    } else if (payload.refreshToken.trim() !== '') {
      value.refreshToken = payload.refreshToken.trim();
    }
  }

  return { value, errors };
}
