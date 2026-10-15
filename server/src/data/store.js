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

/** @type {{ users: object[], products: object[] }} */
export const db = {
  users: [],
  products: [],
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

export { isoNow };
