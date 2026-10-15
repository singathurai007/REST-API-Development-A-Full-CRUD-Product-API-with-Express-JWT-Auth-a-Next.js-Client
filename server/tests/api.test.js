import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { SEED_CREDENTIALS, seed } from '../src/data/store.js';

/**
 * ===== Automated API tests =====
 *
 * Run with:  npm test
 *
 * These cover the same scenarios you would click through in Postman, so the
 * contract cannot silently regress. Supertest drives the Express app directly
 * (no port needs to be free).
 */

let app;
let adminToken;
let userToken;

const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const login = (credentials) => request(app).post('/api/auth/login').send(credentials);

before(async () => {
  seed({ force: true }); // deterministic demo data
  app = createApp({ logRequests: false });

  const admin = await login(SEED_CREDENTIALS.admin);
  assert.equal(admin.status, 200, 'seeded admin should be able to log in');
  adminToken = admin.body.data.token;

  const user = await login(SEED_CREDENTIALS.user);
  assert.equal(user.status, 200, 'seeded user should be able to log in');
  userToken = user.body.data.token;
});

/* ------------------------------------------------------------------ */
/* Health & discovery                                                  */
/* ------------------------------------------------------------------ */

test('GET /api/health returns 200 and a status payload (public)', async () => {
  const res = await request(app).get('/api/health');

  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'ok');
});

test('GET /api lists the available endpoints', async () => {
  const res = await request(app).get('/api');

  assert.equal(res.status, 200);
  assert.ok(res.body.data.endpoints.listProducts);
});

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

test('POST /api/auth/register returns 422 with per-field details for invalid input', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'A', email: 'not-an-email', password: 'short' });

  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  assert.ok(Array.isArray(res.body.error.details));
  assert.deepEqual(
    res.body.error.details.map((detail) => detail.field).sort(),
    ['email', 'name', 'password'],
  );
});

test('POST /api/auth/register returns 201 and a token for valid input', async () => {
  const email = `tester${Date.now()}@example.com`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Test User', email, password: 'Secret123' });

  assert.equal(res.status, 201);
  assert.equal(res.body.data.user.email, email);
  assert.equal(res.body.data.user.role, 'user', 'role should default to user');
  assert.equal(res.body.data.user.passwordHash, undefined, 'password hash must never leak');
  assert.equal(typeof res.body.data.token, 'string');
  assert.match(res.headers.location, /^\/api\/users\//);
});

test('POST /api/auth/register returns 409 when the email is already taken', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Copy Cat', email: SEED_CREDENTIALS.admin.email, password: 'Secret123' });

  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'EMAIL_IN_USE');
});

test('POST /api/auth/login returns 401 for a wrong password', async () => {
  const res = await login({ email: SEED_CREDENTIALS.admin.email, password: 'wrong-password' });

  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
});

test('GET /api/auth/me returns the current user for a valid token', async () => {
  const res = await request(app).get('/api/auth/me').set(bearer(adminToken));

  assert.equal(res.status, 200);
  assert.equal(res.body.data.user.email, SEED_CREDENTIALS.admin.email);
  assert.deepEqual(res.body.meta.permissions, ['read', 'create', 'update', 'delete']);
});

/* ------------------------------------------------------------------ */
/* Authentication / authorisation guards                               */
/* ------------------------------------------------------------------ */

test('GET /api/products returns 401 without an Authorization header', async () => {
  const res = await request(app).get('/api/products');

  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'AUTH_REQUIRED');
});

test('GET /api/products returns 401 for a tampered token', async () => {
  const res = await request(app).get('/api/products').set(bearer('not.a.real.token'));

  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'INVALID_TOKEN');
});

test('POST /api/products returns 403 when a non-admin tries to write', async () => {
  const res = await request(app)
    .post('/api/products')
    .set(bearer(userToken))
    .send({ name: 'Sneaky Item', price: 10, category: 'electronics' });

  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'FORBIDDEN');
});

/* ------------------------------------------------------------------ */
/* READ: list + query parameters                                       */
/* ------------------------------------------------------------------ */

test('GET /api/products paginates and returns meta', async () => {
  const res = await request(app).get('/api/products?page=1&limit=2').set(bearer(userToken));

  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 2);
  assert.equal(res.body.meta.page, 1);
  assert.equal(res.body.meta.limit, 2);
  assert.equal(res.body.meta.total, 6);
  assert.equal(res.body.meta.totalPages, 3);
  assert.equal(res.body.meta.hasNext, true);
  assert.equal(res.body.meta.hasPrev, false);
  assert.equal(res.headers['x-total-count'], '6');
});

test('GET /api/products supports search, category and price filters', async () => {
  const search = await request(app).get('/api/products?search=mouse').set(bearer(userToken));
  assert.equal(search.body.meta.total, 1);
  assert.equal(search.body.data[0].name, 'Wireless Mouse');

  const category = await request(app)
    .get('/api/products?category=electronics&sort=price&order=desc')
    .set(bearer(userToken));
  assert.equal(category.body.meta.total, 2);
  assert.equal(category.body.data[0].name, 'Mechanical Keyboard');

  const range = await request(app)
    .get('/api/products?minPrice=10&maxPrice=30&sort=price&order=asc')
    .set(bearer(userToken));
  assert.ok(range.body.data.every((product) => product.price >= 10 && product.price <= 30));
  assert.equal(range.body.data[0].price, 12.75);
});

test('GET /api/products?inStock=false returns only out-of-stock products', async () => {
  const res = await request(app).get('/api/products?inStock=false').set(bearer(userToken));

  assert.equal(res.status, 200);
  assert.equal(res.body.meta.total, 1);
  assert.equal(res.body.data[0].stock, 0);
});

test('GET /api/products?fields=id,name,price projects the response', async () => {
  const res = await request(app)
    .get('/api/products?fields=id,name,price&limit=1')
    .set(bearer(userToken));

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body.data[0]).sort(), ['id', 'name', 'price']);
});

test('GET /api/products returns 422 for an invalid query parameter', async () => {
  const res = await request(app)
    .get('/api/products?limit=999&sort=colour&by=asc&unknown=1')
    .set(bearer(userToken));

  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  const fields = res.body.error.details.map((detail) => detail.field);
  assert.ok(fields.includes('limit'));
  assert.ok(fields.includes('sort'));
  assert.ok(fields.includes('unknown'));
  assert.ok(res.body.error.details.every((detail) => detail.in === 'query'));
});

/* ------------------------------------------------------------------ */
/* READ: single resource by path parameter                             */
/* ------------------------------------------------------------------ */

test('GET /api/products/:id returns 200 for an existing product', async () => {
  const list = await request(app).get('/api/products?limit=1').set(bearer(userToken));
  const id = list.body.data[0].id;

  const res = await request(app).get(`/api/products/${id}`).set(bearer(userToken));

  assert.equal(res.status, 200);
  assert.equal(res.body.data.id, id);
});

test('GET /api/products/:id returns 404 for an unknown but well-formed id', async () => {
  const res = await request(app)
    .get('/api/products/00000000-0000-4000-8000-000000000000')
    .set(bearer(userToken));

  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'PRODUCT_NOT_FOUND');
});

test('GET /api/products/:id returns 400 for a malformed id', async () => {
  const res = await request(app).get('/api/products/not-a-uuid').set(bearer(userToken));

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_ID');
});

/* ------------------------------------------------------------------ */
/* CREATE                                                             */
/* ------------------------------------------------------------------ */

test('POST /api/products returns 422 with field details for an invalid body', async () => {
  const res = await request(app)
    .post('/api/products')
    .set(bearer(adminToken))
    .send({ name: 'X', price: -5, category: 'spaceships', colour: 'red' });

  assert.equal(res.status, 422);
  const fields = res.body.error.details.map((detail) => detail.field).sort();
  assert.deepEqual(fields, ['category', 'colour', 'name', 'price']);
});

test('POST /api/products returns 201, sets Location and is then readable (full CRUD cycle)', async () => {
  const created = await request(app)
    .post('/api/products')
    .set(bearer(adminToken))
    .send({
      name: 'USB-C Hub',
      description: '7-in-1 aluminium hub with HDMI and card reader.',
      price: '79.9',
      category: 'Electronics',
      stock: '12',
      tags: ['usb-c', 'adapter', 'USB-C'],
    });

  assert.equal(created.status, 201);
  assert.equal(created.body.data.price, 79.9, 'string price should be coerced to a number');
  assert.equal(created.body.data.category, 'electronics', 'enum should be lower-cased');
  assert.deepEqual(created.body.data.tags, ['usb-c', 'adapter'], 'tags should be trimmed + deduped');
  assert.match(created.headers.location, /^\/api\/products\//);

  const id = created.body.data.id;

  const fetched = await request(app).get(`/api/products/${id}`).set(bearer(adminToken));
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.data.name, 'USB-C Hub');

  // --- PUT: full replacement resets omitted optional fields ---
  const replaced = await request(app)
    .put(`/api/products/${id}`)
    .set(bearer(adminToken))
    .send({ name: 'USB-C Hub v2', price: 99, category: 'electronics' });

  assert.equal(replaced.status, 200);
  assert.equal(replaced.body.data.name, 'USB-C Hub v2');
  assert.equal(replaced.body.data.stock, 0, 'PUT resets omitted stock to 0');
  assert.deepEqual(replaced.body.data.tags, [], 'PUT resets omitted tags to []');
  assert.equal(replaced.body.data.description, '');

  // --- PATCH: partial update leaves everything else untouched ---
  const patched = await request(app)
    .patch(`/api/products/${id}`)
    .set(bearer(adminToken))
    .send({ price: 89.5, stock: 3 });

  assert.equal(patched.status, 200);
  assert.equal(patched.body.data.price, 89.5);
  assert.equal(patched.body.data.stock, 3);
  assert.equal(patched.body.data.name, 'USB-C Hub v2', 'PATCH must not clear other fields');
  assert.deepEqual(patched.body.meta.updatedFields.sort(), ['price', 'stock']);

  // --- DELETE ---
  const deleted = await request(app).delete(`/api/products/${id}`).set(bearer(adminToken));
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.data.id, id);

  const gone = await request(app).get(`/api/products/${id}`).set(bearer(adminToken));
  assert.equal(gone.status, 404);
});

test('PUT /api/products/:id returns 422 when required fields are missing', async () => {
  const list = await request(app).get('/api/products?limit=1').set(bearer(userToken));
  const id = list.body.data[0].id;

  const res = await request(app)
    .put(`/api/products/${id}`)
    .set(bearer(adminToken))
    .send({ description: 'only a description' });

  assert.equal(res.status, 422);
  assert.deepEqual(
    res.body.error.details.map((detail) => detail.field).sort(),
    ['category', 'name', 'price'],
  );
});

test('PATCH /api/products/:id returns 422 for an empty body', async () => {
  const list = await request(app).get('/api/products?limit=1').set(bearer(userToken));
  const id = list.body.data[0].id;

  const res = await request(app).patch(`/api/products/${id}`).set(bearer(adminToken)).send({});

  assert.equal(res.status, 422);
  assert.equal(res.body.error.details[0].field, 'body');
});

/* ------------------------------------------------------------------ */
/* DELETE authorisation                                                */
/* ------------------------------------------------------------------ */

test('DELETE /api/products/:id returns 403 for a non-admin', async () => {
  const list = await request(app).get('/api/products?limit=1').set(bearer(userToken));
  const id = list.body.data[0].id;

  const res = await request(app).delete(`/api/products/${id}`).set(bearer(userToken));

  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'FORBIDDEN');
});

/* ------------------------------------------------------------------ */
/* Protocol-level errors                                               */
/* ------------------------------------------------------------------ */

test('malformed JSON in the request body returns 400 INVALID_JSON', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send('{ "email": ');

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'INVALID_JSON');
});

test('an unknown route returns 404 ROUTE_NOT_FOUND', async () => {
  const res = await request(app).get('/api/nope');

  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'ROUTE_NOT_FOUND');
});

test('an unsupported method returns 405 with an Allow header', async () => {
  const res = await request(app).put('/api/products').set(bearer(adminToken)).send({});

  assert.equal(res.status, 405);
  assert.equal(res.body.error.code, 'METHOD_NOT_ALLOWED');
  assert.equal(res.headers.allow, 'GET, POST');
});

test('every error response uses the same envelope shape', async () => {
  const res = await request(app).get('/api/products');

  assert.deepEqual(Object.keys(res.body), ['error']);
  for (const key of ['status', 'code', 'message', 'path', 'method', 'timestamp']) {
    assert.ok(key in res.body.error, `error.${key} should be present`);
  }
});
