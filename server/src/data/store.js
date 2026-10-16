import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

/**
 * In-memory data store.
 *
 * A real application would replace these arrays with a database client.
 * Everything the API needs is behind the small helpers at the bottom of this
 * file, so swapping in SQL/Mongo later only touches this module.
 */

const isoNow = () => new Date().toISOString();

/** @type {{ users: object[], products: object[], refreshTokens: object[], revokedAccessTokens: object[] }} */
export const db = {
  users: [],
  products: [],
  // One row per issued refresh token, so it can be rotated on use and revoked
  // on logout. Wiped on restart, which is fine for an in-memory demo.
  refreshTokens: [],
  // Access tokens whose `jti` was revoked at logout. Honoured until the token
  // would have expired anyway.
  revokedAccessTokens: [],
};

export const ROLES = ['user', 'admin'];

export const CATEGORIES = ['electronics', 'furniture', 'stationery', 'clothing', 'grocery'];

/** Credentials printed in the README so reviewers can log in immediately. */
export const SEED_CREDENTIALS = {
  admin: { email: 'admin@example.com', password: 'Admin@123' },
  user: { email: 'user@example.com', password: 'User@123' },
};

const SEED_PRODUCTS = [
  {
    name: 'Wireless Mouse',
    description: 'Ergonomic 2.4GHz wireless mouse with a silent click.',
    price: 29.99,
    category: 'electronics',
    stock: 42,
    tags: ['wireless', 'mouse', 'peripherals'],
  },
  {
    name: 'Mechanical Keyboard',
    description: 'Tenkeyless mechanical keyboard with hot-swappable switches.',
    price: 89.5,
    category: 'electronics',
    stock: 15,
    tags: ['keyboard', 'peripherals'],
  },
  {
    name: 'Standing Desk',
    description: 'Height-adjustable desk with electric memory presets.',
    price: 449,
    category: 'furniture',
    stock: 6,
    tags: ['desk', 'ergonomic'],
  },
  {
    name: 'A4 Notebook (Pack of 5)',
    description: 'Ruled 200-page notebooks with a hard cover.',
    price: 12.75,
    category: 'stationery',
    stock: 0,
    tags: ['paper', 'notebook'],
  },
  {
    name: 'Cotton Hoodie',
    description: 'Heavyweight fleece hoodie, unisex fit.',
    price: 54.0,
    category: 'clothing',
    stock: 88,
    tags: ['apparel'],
  },
  {
    name: 'Arabica Coffee Beans 1kg',
    description: 'Medium roast single-origin arabica, whole bean.',
    price: 21.4,
    category: 'grocery',
    stock: 120,
    tags: ['coffee', 'food'],
  },
];

let hasSeeded = false;

/** Creates a user object with a securely hashed password. */
export function makeUser({ name, email, password, role = 'user' }) {
  const timestamp = isoNow();
  return {
    id: randomUUID(),
    name,
    email: String(email).toLowerCase(),
    passwordHash: bcrypt.hashSync(password, 10),
    role,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Fills the store with demo data.
 * `force` is used by the test-suite to get a clean slate between runs.
 */
export function seed({ force = false } = {}) {
  if (hasSeeded && !force) return;
  hasSeeded = true;

  const timestamp = isoNow();

  // A forced reseed also clears any in-flight sessions.
  db.refreshTokens = [];
  db.revokedAccessTokens = [];

  db.users = [
    makeUser({
      name: 'Ada Admin',
      email: SEED_CREDENTIALS.admin.email,
      password: SEED_CREDENTIALS.admin.password,
      role: 'admin',
    }),
    makeUser({
      name: 'Uma User',
      email: SEED_CREDENTIALS.user.email,
      password: SEED_CREDENTIALS.user.password,
      role: 'user',
    }),
  ];

  db.products = SEED_PRODUCTS.map((product) => ({
    id: randomUUID(),
    tags: [],
    ...product,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

/** Removes the password hash before a user object is sent over the wire. */
export function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

export function findUserByEmail(email) {
  if (!email) return undefined;
  const needle = String(email).trim().toLowerCase();
  return db.users.find((user) => user.email === needle);
}

export function findUserById(id) {
  return db.users.find((user) => user.id === id);
}

export function findProductById(id) {
  return db.products.find((product) => product.id === id);
}

export function addProduct(product) {
  db.products.push(product);
  return product;
}

export function removeProduct(id) {
  const index = db.products.findIndex((product) => product.id === id);
  if (index === -1) return null;
  const [removed] = db.products.splice(index, 1);
  return removed;
}

/* ------------------------------------------------------------------ */
/* Tokens: refresh-token rotation + access-token revocation            */
/* ------------------------------------------------------------------ */

/**
 * Drops rows whose token has expired anyway. Called whenever a token is
 * issued or revoked so both lists stay small without a background timer.
 */
export function pruneTokenStore(now = Date.now()) {
  const isExpired = (iso) => new Date(iso).getTime() <= now;
  db.refreshTokens = db.refreshTokens.filter((row) => !isExpired(row.expiresAt));
  db.revokedAccessTokens = db.revokedAccessTokens.filter((row) => !isExpired(row.expiresAt));
}

/** Records a freshly issued refresh token so it can be rotated/revoked later. */
export function rememberRefreshToken({ jti, userId, expiresAt }) {
  pruneTokenStore();
  const row = { jti, userId, expiresAt, revokedAt: null, createdAt: isoNow() };
  db.refreshTokens.push(row);
  return row;
}

export function findRefreshToken(jti) {
  if (!jti) return undefined;
  return db.refreshTokens.find((row) => row.jti === jti);
}

/** Revokes one refresh token. Returns the row, or undefined when unknown. */
export function revokeRefreshTokenRecord(jti, reason = 'logout') {
  const row = findRefreshToken(jti);
  if (!row) return undefined;
  if (!row.revokedAt) {
    row.revokedAt = isoNow();
    row.revokedReason = reason;
  }
  return row;
}

/**
 * Revokes every still-active refresh token of a user.
 * Used when a *already rotated* token is presented again: that means the token
 * leaked, so the safest reaction is to end every session for that account.
 */
export function revokeAllRefreshTokensForUser(userId, reason = 'token-reuse') {
  let count = 0;
  for (const row of db.refreshTokens) {
    if (row.userId === userId && !row.revokedAt) {
      row.revokedAt = isoNow();
      row.revokedReason = reason;
      count += 1;
    }
  }
  return count;
}

/** Adds an access token's id to the revocation list (used on logout). */
export function blacklistAccessToken({ jti, expiresAt }) {
  pruneTokenStore();
  if (isAccessTokenRevoked(jti)) return false;
  db.revokedAccessTokens.push({ jti, expiresAt, revokedAt: isoNow() });
  return true;
}

/** True when the access token's `jti` was revoked before it expired. */
export function isAccessTokenRevoked(jti) {
  if (!jti) return false;
  return db.revokedAccessTokens.some((row) => row.jti === jti);
}

export { isoNow };
