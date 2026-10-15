import { randomUUID } from 'node:crypto';
import { ApiError } from '../utils/ApiError.js';
import {
  addProduct,
  db,
  findProductById,
  isoNow,
  removeProduct,
} from '../data/store.js';

/**
 * ===== Products controller (CRUD) =====
 *
 * Request bodies and query strings arriving here have ALREADY been validated
 * and normalised by the `validate()` middleware, so this layer only contains
 * business logic. That separation is the main reason validation lives in
 * `validators/` rather than inside the controllers.
 */

/** Applies sparse field selection (`?fields=id,name,price`). */
function project(product, fields) {
  if (!fields?.length) return product;
  return fields.reduce((accumulator, field) => {
    accumulator[field] = product[field];
    return accumulator;
  }, {});
}

/**
 * GET /api/products
 * Query parameters: page, limit, search, category, minPrice, maxPrice,
 *                   inStock, sort, order, fields
 */
export function listProducts(req, res) {
  const { page, limit, search, category, minPrice, maxPrice, inStock, sort, order, fields } = req.query;

  let items = [...db.products];

  if (search) {
    items = items.filter((product) =>
      `${product.name} ${product.description ?? ''}`.toLowerCase().includes(search),
    );
  }
  if (category) {
    items = items.filter((product) => product.category === category);
  }
  if (minPrice !== undefined) {
    items = items.filter((product) => product.price >= minPrice);
  }
  if (maxPrice !== undefined) {
    items = items.filter((product) => product.price <= maxPrice);
  }
  if (inStock !== undefined) {
    items = items.filter((product) => (product.stock > 0) === inStock);
  }

  if (sort) {
    const direction = order === 'desc' ? -1 : 1;
    items.sort((a, b) => {
      const left = a[sort];
      const right = b[sort];
      if (left === right) return 0;
      return (left > right ? 1 : -1) * direction;
    });
  }

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const data = items.slice(start, start + limit).map((product) => project(product, fields));

  // Response metadata is what lets a UI render pagination without guessing.
  res.set('X-Total-Count', String(total));
  res.status(200).json({
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
      sort: sort ?? null,
      order: sort ? order : null,
    },
  });
}

/** GET /api/products/:id */
export function getProduct(req, res) {
  const product = findProductById(req.params.id);
  if (!product) {
    throw ApiError.notFound(`No product exists with id "${req.params.id}"`, 'PRODUCT_NOT_FOUND');
  }
  res.status(200).json({ data: product });
}

/** POST /api/products -> 201 Created (+ Location header) */
export function createProduct(req, res) {
  const timestamp = isoNow();

  const product = {
    id: randomUUID(),
    name: req.body.name,
    description: req.body.description ?? '',
    price: req.body.price,
    category: req.body.category,
    stock: req.body.stock ?? 0,
    tags: req.body.tags ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  addProduct(product);

  res
    .status(201)
    .location(`/api/products/${product.id}`)
    .json({ message: 'Product created', data: product });
}

/**
 * PUT /api/products/:id
 * Full replacement: fields that are omitted are reset to their defaults, which
 * is exactly what separates PUT from PATCH.
 */
export function replaceProduct(req, res) {
  const product = findProductById(req.params.id);
  if (!product) {
    throw ApiError.notFound(`No product exists with id "${req.params.id}"`, 'PRODUCT_NOT_FOUND');
  }

  product.name = req.body.name;
  product.description = req.body.description ?? '';
  product.price = req.body.price;
  product.category = req.body.category;
  product.stock = req.body.stock ?? 0;
  product.tags = req.body.tags ?? [];
  product.updatedAt = isoNow();

  res.status(200).json({ message: 'Product replaced', data: product });
}

/** PATCH /api/products/:id - partial update, only supplied fields change. */
export function patchProduct(req, res) {
  const product = findProductById(req.params.id);
  if (!product) {
    throw ApiError.notFound(`No product exists with id "${req.params.id}"`, 'PRODUCT_NOT_FOUND');
  }

  const changed = [];
  for (const [key, value] of Object.entries(req.body)) {
    if (product[key] === value) continue;
    product[key] = value;
    changed.push(key);
  }

  if (changed.length > 0) {
    product.updatedAt = isoNow();
  }

  res.status(200).json({
    message: changed.length ? `Product updated (${changed.join(', ')})` : 'Product unchanged',
    data: product,
    meta: { updatedFields: changed },
  });
}

/** DELETE /api/products/:id */
export function deleteProduct(req, res) {
  const removed = removeProduct(req.params.id);
  if (!removed) {
    throw ApiError.notFound(`No product exists with id "${req.params.id}"`, 'PRODUCT_NOT_FOUND');
  }
  res.status(200).json({ message: 'Product deleted', data: removed });
}
