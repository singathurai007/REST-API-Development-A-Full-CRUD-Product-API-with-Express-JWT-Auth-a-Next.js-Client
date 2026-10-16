# REST API Development — Practical Project

A complete, runnable project for **Topic 7: REST API Development**.

It contains a standalone **Express REST API** (the thing you test in Postman/Insomnia) and a
**React / Next.js frontend** that consumes it, so the full "develop → test → integrate" loop is
covered end to end.

---

## 1. Topics covered

| Topic | Where it lives |
|---|---|
| HTTP methods (GET, POST, PUT, PATCH, DELETE) | [productRoutes.js](server/src/routes/productRoutes.js), [productController.js](server/src/controllers/productController.js) |
| Request parameters (path params) | `GET/PUT/PATCH/DELETE /api/products/:id` — [productRoutes.js](server/src/routes/productRoutes.js), [validate.js](server/src/middleware/validate.js) |
| Query parameters | `GET /api/products?page=&limit=&search=&category=&minPrice=&maxPrice=&inStock=&sort=&order=&fields=` — [productValidators.js](server/src/validators/productValidators.js), [client/lib/api.js](client/lib/api.js) |
| Request body (JSON) | `POST` / `PUT` / `PATCH` — [productValidators.js](server/src/validators/productValidators.js) |
| HTTP status codes | 200, 201, 204-free deletes, 400, 401, 403, 404, 405, 409, 413, 415, 422, 429, 500 — [ApiError.js](server/src/utils/ApiError.js) |
| JSON | Request + response envelopes (`{ data, meta, message }`) |
| API validation | [productValidators.js](server/src/validators/productValidators.js), [authValidators.js](server/src/validators/authValidators.js), [validate.js](server/src/middleware/validate.js) |
| Authentication basics | JWT + bcrypt — [auth.js](server/src/middleware/auth.js), [authController.js](server/src/controllers/authController.js) |
| Token refresh + logout (revocation) | Access/refresh token pair, rotation & `jti` blacklist — `POST /auth/refresh`, `POST /auth/logout` |
| Authorization basics | Role-based access control (RBAC) — `authorize('admin')` in [productRoutes.js](server/src/routes/productRoutes.js) |
| Error responses | Single error envelope — [errorHandler.js](server/src/middleware/errorHandler.js) |
| API testing in Postman/Insomnia | [postman/](server/postman) collection + environment |
| CRUD + frontend integration | [client/](client) (Next.js App Router) |

---

## 2. Project structure

```
rest-api-project/
├── server/                        Express REST API  (http://localhost:4000)
│   ├── src/
│   │   ├── index.js               server bootstrap / graceful shutdown
│   │   ├── app.js                 Express app + middleware order
│   │   ├── routes/                authRoutes, productRoutes, index
│   │   ├── controllers/           authController, productController
│   │   ├── validators/            request body + query validation schemas
│   │   ├── middleware/            auth, validate, errorHandler, rateLimit, logger, 405
│   │   ├── data/store.js          in-memory store + seed data
│   │   └── utils/ApiError.js      typed HTTP errors
│   ├── tests/api.test.js          35 automated API tests (node:test + supertest)
│   └── postman/                   Postman/Insomnia collection + environment
│
└── client/                        Next.js 14 frontend  (http://localhost:3000)
    ├── app/                       / (dashboard), /login, /products/[id]
    ├── components/                AuthProvider, ProductTable, ProductForm, Filters, …
    └── lib/api.js                 fetch-based API client
```

---

## 3. Run it

Open **two terminals**.

**Terminal 1 — API**

```powershell
cd server
npm install
npm run dev          # or: npm start
```

→ `http://localhost:4000/api`

**Terminal 2 — frontend**

```powershell
cd client
npm install
npm run dev
```

→ `http://localhost:3000`

`server/.env` and `client/.env.local` are already created from the `.example` files, so both apps
work with no further configuration.

### Demo accounts (seeded automatically)

| Role | Email | Password | Can do |
|---|---|---|---|
| admin | `admin@example.com` | `Admin@123` | read + create + update + delete |
| user | `user@example.com` | `User@123` | read only (writes return **403**) |

Log in as both to see the authorization difference: the **New / Edit / Delete** buttons only
appear for `admin`.

---

## 4. API reference

Base URL: `http://localhost:4000/api`

### Public

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness probe |
| GET | `/` | Discovery document listing every endpoint |
| POST | `/auth/register` | Create an account → **201** + token pair |
| POST | `/auth/login` | Exchange credentials for a token pair → **200** |
| POST | `/auth/refresh` | Exchange a refresh token for a new pair → **200** |
| POST | `/auth/logout` | Revoke the access + refresh token → **200** (idempotent) |

### Requires `Authorization: Bearer <token>`

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/auth/me` | any | Current user + permissions |
| GET | `/products` | any | List, filter, sort, paginate |
| GET | `/products/:id` | any | Read one product |
| POST | `/products` | **admin** | Create → **201** + `Location` header |
| PUT | `/products/:id` | **admin** | Full replace (omitted fields reset) |
| PATCH | `/products/:id` | **admin** | Partial update |
| DELETE | `/products/:id` | **admin** | Delete |

#### Access + refresh tokens

`/auth/login` and `/auth/register` return **two** JWTs:

```json
{
  "data": {
    "user": { "id": "…", "email": "…", "role": "admin" },
    "token": "<access token>",
    "refreshToken": "<refresh token>",
    "tokenType": "Bearer",
    "expiresIn": "1h",
    "refreshExpiresIn": "7d"
  }
}
```

The access token is short-lived (`JWT_EXPIRES_IN`, default `1h`) and is what you send on every
request. The refresh token is long-lived (`JWT_REFRESH_EXPIRES_IN`, default `7d`) and exists only
to mint a new pair — so an expired access token no longer means "log in again":

```http
POST /api/auth/refresh   { "refreshToken": "<refresh token>" }   # -> 200 + a NEW pair
# Authorization: Bearer <access token>     plus the body below
POST /api/auth/logout    { "refreshToken": "<refresh token>" }   # -> 200 { revoked: [...] }
```

Both token kinds carry a unique `jti` (JWT id), which is what makes revocation possible:

- **Refresh rotation** — refresh tokens are single use. Each `/auth/refresh` call returns a new
  one and retires the one you sent. Replaying a retired token is treated as a leak: the request
  fails with `401 REFRESH_TOKEN_REUSED` **and every session for that account is revoked**.
- **Logout blacklist** — `/auth/logout` adds the access token's `jti` to a revocation list, so a
  token that has *not* expired yet stops working immediately (`401 TOKEN_REVOKED`), and revokes the
  refresh token at the same time. The route deliberately needs no valid access token (a session
  whose access token already expired must still be closable) and is idempotent.
- The two token kinds are signed with **different secrets**, so neither can be presented in place
  of the other (`401 INVALID_TOKEN` / `401 INVALID_REFRESH_TOKEN`).

The Next.js client does all of this transparently: [lib/api.js](client/lib/api.js) catches a `401`,
calls `POST /auth/refresh` once (concurrent requests share a single call), stores the new pair and
replays the original request.

**PUT vs PATCH** — the distinction is enforced and observable:

```http
PUT /api/products/:id     { "name": "Hub v2", "price": 99, "category": "electronics" }
# -> omitted stock/tags/description are RESET to 0 / [] / ""
#    response meta: { "updatedFields": [...] }

PATCH /api/products/:id   { "price": 89.5 }
# -> only price changes, everything else survives
#    response meta: { "updatedFields": ["price"] }
```

### Query parameters for `GET /api/products`

| Parameter | Example | Notes |
|---|---|---|
| `page` | `2` | integer ≥ 1, default 1 |
| `limit` | `5` | integer 1–50, default 10 |
| `search` | `mouse` | matches name + description |
| `category` | `electronics` | `electronics \| furniture \| stationery \| clothing \| grocery` |
| `minPrice` / `maxPrice` | `10` / `100` | numbers ≥ 0 |
| `inStock` | `true` | boolean |
| `sort` | `price` | `name \| price \| stock \| createdAt \| updatedAt` |
| `order` | `desc` | `asc \| desc` |
| `fields` | `id,name,price` | sparse field selection |

Response:

```json
{
  "data": [ { "id": "…", "name": "Wireless Mouse", "price": 29.99, "stock": 42, "…": "…" } ],
  "meta": { "page": 1, "limit": 10, "total": 6, "totalPages": 1, "hasNext": false, "hasPrev": false }
}
```

Unknown or out-of-range parameters are rejected with **422**, never silently ignored.

### Error responses

Every failure — validation, auth, routing, even malformed JSON — returns the **same** envelope:

```json
{
  "error": {
    "status": 422,
    "code": "VALIDATION_ERROR",
    "message": "3 validation error(s) found in the request",
    "details": [
      { "in": "body", "field": "price", "message": "price must be greater than 0" },
      { "in": "body", "field": "category", "message": "category must be one of: electronics, furniture, …" }
    ],
    "path": "/api/products",
    "method": "POST",
    "timestamp": "2026-10-15T09:12:44.981Z"
  }
}
```

Status codes in use: `400` malformed JSON / bad path param · `401` missing or invalid token ·
`403` authenticated but wrong role · `404` unknown route or resource · `405` wrong method
(+ `Allow` header) · `409` duplicate email · `413` body too large · `422` validation failed ·
`429` rate limited · `500` unexpected server error.

---

## 5. Testing the API in Postman / Insomnia

1. Start the API (`cd server && npm run dev`).
2. **Import** both files from `server/postman/`:
   - `REST-API-Development.postman_collection.json`
   - `REST-API-Development.postman_environment.json`
3. Select the **"REST API Development - Local"** environment.
4. Run the folders in order — folder **01** logs in and stores the JWT in the `token`
   environment variable automatically, so later requests are pre-authenticated.

| Folder | What it demonstrates |
|---|---|
| `00 - Health & discovery` | Public endpoints, no auth |
| `01 - Authentication & authorization` | 200/201/401/409, JWT capture, `Location` header |
| `02 - Products - READ` | All query parameters, pagination `meta`, `X-Total-Count` |
| `03 - Products - WRITE` | Full POST → PUT → PATCH → DELETE lifecycle |
| `04 - Error & status-code scenarios` | One request per failure mode: 400/401/403/404/405/422 |
| `05 - Refresh token & logout` | Rotating the token pair, reuse detection, access-token revocation |

Every request ships with a **Tests** script (`pm.test`), so you can also hit **Run** on the whole
collection and get a green/red report. On Windows, `Ctrl+Alt+C` opens the Postman console if you
want to inspect the raw request/response.

> **Insomnia** imports the same Postman v2.1 collection and environment directly
> (*Application → Import → From File*).

---

## 6. Automated tests

The same scenarios are covered by 35 automated tests (no server or port needed):

```powershell
cd server
npm test
```

```
ℹ tests 35
ℹ pass 35
ℹ fail 0
```

They cover: health/discovery, registration + duplicate email, login success/failure, 401 with a
missing or tampered token, 403 for a non-admin write, pagination and every query filter, field
projection, 400 vs 404 on path parameters, the full POST→PUT→PATCH→DELETE cycle, malformed JSON,
unknown routes, 405 with `Allow`, the consistency of the error envelope, plus the access + refresh
token lifecycle (rotation, reuse detection, revocation and idempotent logout).

---

## 7. Architecture notes

**Middleware order** in [app.js](server/src/app.js) — requests flow top to bottom:

```
cors → express.json → requestLogger → rateLimit → routes → notFoundHandler → errorHandler
```

**Validation is separate from business logic.** Validators take a payload and return
`{ value, errors }`. The `validate()` middleware collects errors from `body`, `query` and
`params` into a single 422 response, and replaces `req.body` / `req.query` with the *normalised*
values (trimmed strings, coerced numbers, lower-cased enums, applied defaults) so controllers
never re-check types.

**Data layer.** `src/data/store.js` is an in-memory store seeded on boot. Swap it for SQL/Mongo
by changing that one file — controllers only use the helpers it exports.

**Auth.** Passwords are hashed with bcrypt (never stored in plain text, and the hash is stripped
from every response). Tokens are stateless JWTs sent as `Authorization: Bearer <token>`; the
payload carries `sub` (user id), `role` and a unique `jti`, which is what `authorize('admin')`
checks. Each login/register returns a short-lived **access** token plus a long-lived **refresh**
token signed with a *separate* secret. Refresh tokens rotate on every use (single-use), reuse of
an already-rotated token revokes the whole family, and logging out blacklists the presented access
token's `jti` so it stops working immediately.

**Gotcha worth knowing.** The auth handlers are deliberately **synchronous**. Express 4 does not
forward a rejected promise from an `async` handler to the error handler, so a `throw` inside
`async` would hang the request instead of producing a JSON error. Express 5 fixes this natively.
