import { CATEGORIES, db } from '../data/store.js';

/**
 * ===== Request validation (API validation topic) =====
 *
 * Every validator in this project follows the same contract:
 *
 *   (payload) => { value, errors }
 *
 * - `errors` is a list of `{ field, message }` problems found in the payload
 * - `value`  is the *normalised* payload (trimmed strings, coerced numbers,
 *            lower-cased enums, defaults applied) that the controller can
 *            trust without re-checking anything.
 *
 * The `validate()` middleware collects the errors into a single 422 response
 * and replaces the raw input with `value`.
 */

export const SORTABLE_FIELDS = ['name', 'price', 'stock', 'createdAt', 'updatedAt'];
export const SELECTABLE_FIELDS = [
  'id',
  'name',
  'description',
  'price',
  'category',
  'stock',
  'tags',
  'createdAt',
  'updatedAt',
];
export const WRITABLE_FIELDS = ['name', 'description', 'price', 'category', 'stock', 'tags'];

/** Keys a client may send back when round-tripping a whole resource. */
const IGNORED_FIELDS = ['id', 'createdAt', 'updatedAt', '_links'];

const NAME_MIN = 2;
const NAME_MAX = 120;
const DESCRIPTION_MAX = 2000;
const PRICE_MAX = 1_000_000;
const STOCK_MAX = 1_000_000;
const TAGS_MAX_COUNT = 20;
const TAG_MAX_LENGTH = 40;

const LIMIT_DEFAULT = 10;
const LIMIT_MAX = 50;
const PAGE_MAX = 10_000;

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isMissing = (value) =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

/** Lenient number parsing so `?price=29.99` (a string) works like `29.99`. */
function asNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
}

function asBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const needle = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(needle)) return true;
    if (['false', '0', 'no'].includes(needle)) return false;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Request body validation                                             */
/* ------------------------------------------------------------------ */

/**
 * Shared body validator.
 *
 * @param {object} payload raw `req.body`
 * @param {{ partial: boolean, requireAtLeastOne?: boolean }} options
 *   - partial: false -> used by POST and PUT (full payload, required fields enforced)
 *   - partial: true  -> used by PATCH (only the supplied fields are validated)
 */
function validateProductFields(payload, { partial, requireAtLeastOne = false }) {
  const errors = [];

  if (!isPlainObject(payload)) {
    return {
      value: {},
      errors: [{ field: 'body', message: 'request body must be a JSON object' }],
    };
  }

  // Reject unknown keys so typos surface immediately instead of being dropped.
  for (const key of Object.keys(payload)) {
    if (!WRITABLE_FIELDS.includes(key) && !IGNORED_FIELDS.includes(key)) {
      errors.push({
        field: key,
        message: `unknown field "${key}". Allowed fields: ${WRITABLE_FIELDS.join(', ')}`,
      });
    }
  }

  if (requireAtLeastOne) {
    const supplied = WRITABLE_FIELDS.filter((field) => payload[field] !== undefined);
    if (supplied.length === 0) {
      errors.push({
        field: 'body',
        message: `PATCH requires at least one updatable field (${WRITABLE_FIELDS.join(', ')}). Use PUT to replace the whole resource.`,
      });
    }
  }

  const value = {};

  // ---- name: required on full payloads, optional on PATCH ----
  const nameSupplied = payload.name !== undefined;
  if (!partial || nameSupplied) {
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
  }

  // ---- description: optional free text ----
  if (payload.description !== undefined) {
    if (payload.description === null) {
      value.description = '';
    } else if (typeof payload.description !== 'string') {
      errors.push({ field: 'description', message: 'description must be a string' });
    } else if (payload.description.length > DESCRIPTION_MAX) {
      errors.push({
        field: 'description',
        message: `description must be at most ${DESCRIPTION_MAX} characters long`,
      });
    } else {
      value.description = payload.description.trim();
    }
  }

  // ---- price: required on full payloads, number > 0 ----
  if (!partial || payload.price !== undefined) {
    if (isMissing(payload.price)) {
      errors.push({ field: 'price', message: 'price is required' });
    } else {
      const price = asNumber(payload.price);
      if (!Number.isFinite(price)) {
        errors.push({ field: 'price', message: 'price must be a number' });
      } else if (price <= 0) {
        errors.push({ field: 'price', message: 'price must be greater than 0' });
      } else if (price > PRICE_MAX) {
        errors.push({ field: 'price', message: `price must not exceed ${PRICE_MAX}` });
      } else {
        value.price = Math.round(price * 100) / 100; // store money to 2 decimals
      }
    }
  }

  // ---- category: required on full payloads, must be a known enum value ----
  if (!partial || payload.category !== undefined) {
    if (isMissing(payload.category)) {
      errors.push({ field: 'category', message: 'category is required' });
    } else if (typeof payload.category !== 'string') {
      errors.push({ field: 'category', message: 'category must be a string' });
    } else {
      const category = payload.category.trim().toLowerCase();
      if (!CATEGORIES.includes(category)) {
        errors.push({
          field: 'category',
          message: `category must be one of: ${CATEGORIES.join(', ')}`,
        });
      } else {
        value.category = category;
      }
    }
  }

  // ---- stock: optional integer >= 0 (defaults to 0 on create/replace) ----
  if (payload.stock === undefined && !partial) {
    value.stock = 0;
  } else if (payload.stock !== undefined) {
    if (payload.stock === null) {
      errors.push({ field: 'stock', message: 'stock must be an integer >= 0' });
    } else {
      const stock = asNumber(payload.stock);
      if (!Number.isInteger(stock)) {
        errors.push({ field: 'stock', message: 'stock must be a whole number' });
      } else if (stock < 0) {
        errors.push({ field: 'stock', message: 'stock cannot be negative' });
      } else if (stock > STOCK_MAX) {
        errors.push({ field: 'stock', message: `stock must not exceed ${STOCK_MAX}` });
      } else {
        value.stock = stock;
      }
    }
  }

  // ---- tags: optional array of short unique strings ----
  if (payload.tags !== undefined) {
    if (!Array.isArray(payload.tags)) {
      errors.push({ field: 'tags', message: 'tags must be an array of strings' });
    } else if (payload.tags.length > TAGS_MAX_COUNT) {
      errors.push({ field: 'tags', message: `tags must contain at most ${TAGS_MAX_COUNT} items` });
    } else {
      const tags = [];
      payload.tags.forEach((tag, index) => {
        if (typeof tag !== 'string') {
          errors.push({ field: `tags[${index}]`, message: 'each tag must be a string' });
          return;
        }
        const clean = tag.trim().toLowerCase();
        if (!clean) {
          errors.push({ field: `tags[${index}]`, message: 'tags cannot be empty' });
        } else if (clean.length > TAG_MAX_LENGTH) {
          errors.push({
            field: `tags[${index}]`,
            message: `each tag must be at most ${TAG_MAX_LENGTH} characters long`,
          });
        } else if (!tags.includes(clean)) {
          tags.push(clean);
        }
      });
      value.tags = tags;
    }
  }

  return { value, errors };
}

/** POST /api/products - the whole resource must be supplied. */
export const validateCreateProduct = (payload = {}) =>
  validateProductFields(payload, { partial: false });

/** PUT /api/products/:id - full replacement, same required fields as create. */
export const validateUpdateProduct = (payload = {}) =>
  validateProductFields(payload, { partial: false });

/** PATCH /api/products/:id - partial update, at least one field. */
export const validatePatchProduct = (payload = {}) =>
  validateProductFields(payload, { partial: true, requireAtLeastOne: true });

/* ------------------------------------------------------------------ */
/* Query-string validation                                             */
/* ------------------------------------------------------------------ */

/**
 * Validates + coerces every supported query parameter of `GET /api/products`.
 *
 *   ?page=2&limit=5&search=mouse&category=electronics
 *   &minPrice=10&maxPrice=100&inStock=true&sort=price&order=desc
 *   &fields=id,name,price
 */
export function validateProductQuery(query = {}) {
  const errors = [];
  const value = {};

  const known = [
    'page',
    'limit',
    'search',
    'category',
    'minPrice',
    'maxPrice',
    'inStock',
    'sort',
    'order',
    'fields',
  ];
  for (const key of Object.keys(query)) {
    if (!known.includes(key)) {
      errors.push({ field: key, message: `unknown query parameter. Supported: ${known.join(', ')}` });
    }
  }

  // ---- page ----
  if (isMissing(query.page)) {
    value.page = 1;
  } else {
    const page = asNumber(query.page);
    if (!Number.isInteger(page) || page < 1 || page > PAGE_MAX) {
      errors.push({ field: 'page', message: `page must be an integer between 1 and ${PAGE_MAX}` });
    } else {
      value.page = page;
    }
  }

  // ---- limit ----
  if (isMissing(query.limit)) {
    value.limit = LIMIT_DEFAULT;
  } else {
    const limit = asNumber(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > LIMIT_MAX) {
      errors.push({ field: 'limit', message: `limit must be an integer between 1 and ${LIMIT_MAX}` });
    } else {
      value.limit = limit;
    }
  }

  // ---- search (free text, matched against name + description) ----
  if (!isMissing(query.search)) {
    if (typeof query.search !== 'string') {
      errors.push({ field: 'search', message: 'search must be a string' });
    } else {
      value.search = query.search.trim().toLowerCase();
    }
  }

  // ---- category ----
  if (!isMissing(query.category)) {
    const category = String(query.category).trim().toLowerCase();
    if (!CATEGORIES.includes(category)) {
      errors.push({ field: 'category', message: `category must be one of: ${CATEGORIES.join(', ')}` });
    } else {
      value.category = category;
    }
  }

  // ---- minPrice / maxPrice ----
  for (const field of ['minPrice', 'maxPrice']) {
    if (isMissing(query[field])) continue;
    const price = asNumber(query[field]);
    if (!Number.isFinite(price) || price < 0) {
      errors.push({ field, message: `${field} must be a number >= 0` });
    } else {
      value[field] = price;
    }
  }
  if (
    value.minPrice !== undefined &&
    value.maxPrice !== undefined &&
    value.minPrice > value.maxPrice
  ) {
    errors.push({ field: 'minPrice', message: 'minPrice cannot be greater than maxPrice' });
  }

  // ---- inStock ----
  if (!isMissing(query.inStock)) {
    const inStock = asBoolean(query.inStock);
    if (inStock === undefined) {
      errors.push({ field: 'inStock', message: 'inStock must be true or false' });
    } else {
      value.inStock = inStock;
    }
  }

  // ---- sort / order ----
  if (!isMissing(query.sort)) {
    const sort = String(query.sort).trim();
    if (!SORTABLE_FIELDS.includes(sort)) {
      errors.push({ field: 'sort', message: `sort must be one of: ${SORTABLE_FIELDS.join(', ')}` });
    } else {
      value.sort = sort;
    }
  }
  if (!isMissing(query.order)) {
    const order = String(query.order).trim().toLowerCase();
    if (!['asc', 'desc'].includes(order)) {
      errors.push({ field: 'order', message: 'order must be either asc or desc' });
    } else {
      value.order = order;
    }
  }
  if (value.sort && !value.order) value.order = 'asc';

  // ---- fields (sparse field-set / projection) ----
  if (!isMissing(query.fields)) {
    const requested = String(query.fields)
      .split(',')
      .map((field) => field.trim())
      .filter(Boolean);
    const unknown = requested.filter((field) => !SELECTABLE_FIELDS.includes(field));
    if (requested.length === 0) {
      errors.push({ field: 'fields', message: 'fields must contain at least one field name' });
    } else if (unknown.length > 0) {
      errors.push({
        field: 'fields',
        message: `unknown field(s): ${unknown.join(', ')}. Selectable: ${SELECTABLE_FIELDS.join(', ')}`,
      });
    } else {
      value.fields = [...new Set(requested)];
    }
  }

  return { value, errors };
}

/** Simple guard used by the /api index endpoint. */
export function countProducts() {
  return db.products.length;
}
