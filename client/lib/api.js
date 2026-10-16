// ---------------------------------------------------------------------------
// API client for the Express REST API.
//
// This module is intentionally framework-agnostic (plain JS, native `fetch`).
// It demonstrates the core REST building blocks we want the UI to surface:
//   * HTTP methods        -> request(path, { method })
//   * Query params        -> listProducts() builds a URLSearchParams string
//   * Path params         -> getProduct(id) -> `/products/${id}`
//   * Request bodies      -> JSON.stringify of the `body` option
//   * Status codes        -> every non-2xx response is turned into an error
//   * Auth header         -> `Authorization: Bearer <token>`
//
// The single `request()` helper below centralises all of that so no component
// ever has to think about headers, JSON parsing or status codes.
// ---------------------------------------------------------------------------

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api';

// localStorage keys used to persist the token pair between reloads.
const TOKEN_KEY = 'rest_api_token';
const REFRESH_TOKEN_KEY = 'rest_api_refresh_token';

/**
 * Rich error type thrown by every `api` method on failure.
 *
 * It mirrors the API's error envelope so the UI can display the exact
 * HTTP status code and machine-readable code:
 *   { status, code, message, details, path }
 */
export class ApiClientError extends Error {
  constructor({ status = 0, code = 'ERROR', message = 'Unknown error', details, path } = {}) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status; // HTTP status code (0 for network failures)
    this.code = code; // e.g. VALIDATION_ERROR, AUTH_REQUIRED, FORBIDDEN
    this.details = details; // per-field validation problems, if any
    this.path = path; // request path (from the error envelope when present)
  }

  /** Friendly one-liner like "403 FORBIDDEN - Only admins can do this". */
  toDisplayString() {
    if (this.status === 0) return `${this.code} - ${this.message}`;
    return `${this.status} ${this.code} - ${this.message}`;
  }
}

// --- token persistence ------------------------------------------------------
// Guarded with `typeof window` so the module is safe to import during SSR.

function readStorage(key) {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* ignore storage failures (private mode, quota, ...) */
  }
}

function readToken() {
  return readStorage(TOKEN_KEY);
}

function writeToken(token) {
  writeStorage(TOKEN_KEY, token);
}

function readRefreshToken() {
  return readStorage(REFRESH_TOKEN_KEY);
}

function writeRefreshToken(token) {
  writeStorage(REFRESH_TOKEN_KEY, token);
}

// --- silent renewal ---------------------------------------------------------
// One shared in-flight promise, so several requests hitting a 401 at the same
// time trigger a single POST /auth/refresh instead of a stampede.
let refreshInFlight = null;

/**
 * Exchanges the stored refresh token for a new access + refresh pair and writes
 * both back to localStorage. Returns the new access token, or null when the
 * session cannot be renewed (no refresh token, or the server rejected it).
 */
async function refreshAccessToken() {
  const refreshToken = readRefreshToken();
  if (!refreshToken) return null;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
          cache: 'no-store',
        });

        // 401/422 mean the refresh token itself is dead -> end the session.
        if (!res.ok) {
          if (res.status === 401 || res.status === 422) {
            writeToken(null);
            writeRefreshToken(null);
          }
          return null;
        }

        const payload = await res.json().catch(() => null);
        const data = payload?.data;
        if (!data?.token || !data?.refreshToken) return null;

        writeToken(data.token);
        writeRefreshToken(data.refreshToken);
        return data.token;
      } catch {
        return null; // network blip - keep the tokens, the caller just fails
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}

/**
 * Core request helper. Everything the client does funnels through here.
 *
 * @param {string} path            API path relative to BASE_URL, e.g. '/products'
 * @param {object} [options]
 * @param {string} [options.method='GET']      HTTP method
 * @param {object} [options.body]              JS object serialised as the JSON request body
 * @param {object} [options.query]             key/value pairs appended as a query string
 * @param {boolean} [options.auth=true]        whether to send the Authorization header
 * @param {boolean} [options.autoRefresh=true] renew an expired access token on 401 and replay once
 * @param {boolean} [options.retry=false]      internal: already replayed after a refresh
 */
async function request(path, options = {}) {
  const { method = 'GET', body, query, auth = true, autoRefresh = true, retry = false } = options;
  // 1. Build the full URL, including any QUERY PARAMS.
  let url = `${BASE_URL}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      // Skip empty/undefined values so we don't send `?search=`.
      if (value === undefined || value === null || value === '') continue;
      params.append(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  // 2. Assemble headers. JSON in, JSON out + bearer auth when we have a token.
  const headers = { Accept: 'application/json' };
  const token = readToken();
  if (token && auth !== false) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  // 3. Fire the request. Network-level failures surface as status 0.
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch (networkError) {
    throw new ApiClientError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: `Cannot reach the API at ${BASE_URL}. Is the server running?`,
      path,
    });
  }

  // 4. 204 No Content (and other empty 2xx) must NOT be parsed as JSON.
  if (res.status === 204) {
    return null;
  }

  const text = await res.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      // Body was not valid JSON -> distinguish server bugs from API errors.
      if (res.ok) {
        throw new ApiClientError({
          status: res.status,
          code: 'INVALID_RESPONSE',
          message: 'The server returned a response that was not valid JSON.',
          path,
        });
      }
      throw new ApiClientError({
        status: res.status,
        code: 'INVALID_RESPONSE',
        message: `Request failed with status ${res.status} and a non-JSON body.`,
        path,
      });
    }
  }

  // 5. Non-2xx -> unwrap the `{ error: {...} }` envelope and throw.
  if (!res.ok) {
    // A 401 usually just means the short-lived access token expired. Renew it
    // silently with the refresh token and replay the request exactly once.
    // (`/auth/refresh` is excluded so a dead refresh token cannot loop.)
    if (res.status === 401 && autoRefresh && auth !== false && !retry && path !== '/auth/refresh') {
      const renewed = await refreshAccessToken();
      if (renewed) return request(path, { ...options, retry: true });
    }

    const err = payload && payload.error ? payload.error : {};
    throw new ApiClientError({
      status: err.status ?? res.status,
      code: err.code ?? 'HTTP_ERROR',
      message: err.message ?? `Request failed with status ${res.status}`,
      details: err.details,
      path: err.path ?? path,
    });
  }

  // 6. Success. Most endpoints wrap the payload in `{ data, meta? }`.
  return payload;
}

// ---------------------------------------------------------------------------
// Public API surface.
// ---------------------------------------------------------------------------

export const api = {
  baseUrl: BASE_URL,

  // ---- token helpers (used by AuthProvider) ------------------------------
  /** Stores the access + refresh pair returned by login/register/refresh. */
  setTokens({ token, refreshToken }) {
    writeToken(token);
    if (refreshToken) writeRefreshToken(refreshToken);
  },
  setToken(token) {
    writeToken(token);
  },
  getToken() {
    return readToken();
  },
  getRefreshToken() {
    return readRefreshToken();
  },
  clearToken() {
    writeToken(null);
  },
  clearTokens() {
    writeToken(null);
    writeRefreshToken(null);
  },

  // ---- health / auth ------------------------------------------------------
  /** GET /health -> { data: { status } } */
  health() {
    return request('/health', { auth: false });
  },

  /** POST /auth/login (request body: { email, password }) -> 200 */
  login({ email, password }) {
    return request('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
  },

  /** POST /auth/register (request body: { name, email, password, role? }) -> 201 */
  register({ name, email, password, role }) {
    const body = { name, email, password };
    if (role) body.role = role;
    return request('/auth/register', { method: 'POST', body, auth: false });
  },

  /**
   * POST /auth/refresh - exchange a refresh token for a new pair.
   * `request()` already does this automatically on a 401; this is exposed for
   * explicit use (and always returns the server's answer, including failures).
   */
  refresh(refreshToken) {
    const token = refreshToken ?? readRefreshToken();
    if (!token) {
      return Promise.reject(
        new ApiClientError({
          status: 0,
          code: 'NO_REFRESH_TOKEN',
          message: 'No refresh token is stored - sign in again.',
          path: '/auth/refresh',
        }),
      );
    }
    return request('/auth/refresh', {
      method: 'POST',
      body: { refreshToken: token },
      auth: false,
    });
  },

  /**
   * POST /auth/logout - revokes the access + refresh token server-side, then
   * clears the local copy. Best effort: even a failed call ends the local
   * session. `autoRefresh: false` keeps it from renewing the token it is about
   * to throw away.
   */
  async logout() {
    const refreshToken = readRefreshToken();
    try {
      await request('/auth/logout', {
        method: 'POST',
        body: refreshToken ? { refreshToken } : {},
        autoRefresh: false,
      });
    } catch {
      /* logging out locally must never fail */
    } finally {
      writeToken(null);
      writeRefreshToken(null);
    }
  },

  /** GET /auth/me (Bearer token) -> { data: { user } } */
  me() {
    return request('/auth/me');
  },

  // ---- products -----------------------------------------------------------
  /** GET /products with QUERY PARAMS (page, limit, search, category, ...). */
  listProducts(query = {}) {
    return request('/products', { query });
  },

  /** GET /products/:id (PATH PARAM). */
  getProduct(id) {
    return request(`/products/${encodeURIComponent(id)}`);
  },

  /** POST /products (request body) -> 201. Admin only. */
  createProduct(body) {
    return request('/products', { method: 'POST', body });
  },

  /** PUT /products/:id - full replace. Admin only. */
  replaceProduct(id, body) {
    return request(`/products/${encodeURIComponent(id)}`, { method: 'PUT', body });
  },

  /** PATCH /products/:id - partial update. Admin only. */
  updateProduct(id, body) {
    return request(`/products/${encodeURIComponent(id)}`, { method: 'PATCH', body });
  },

  /** DELETE /products/:id -> 200. Admin only. */
  deleteProduct(id) {
    return request(`/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};

export default api;
