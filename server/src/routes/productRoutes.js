import { Router } from 'express';
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  patchProduct,
  replaceProduct,
} from '../controllers/productController.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { methodNotAllowed } from '../middleware/methodNotAllowed.js';
import { validate, validateUuidParam } from '../middleware/validate.js';
import {
  validateCreateProduct,
  validatePatchProduct,
  validateProductQuery,
  validateUpdateProduct,
} from '../validators/productValidators.js';

/** ===== /api/products - the CRUD resource ===== */

const router = Router();

// --- Authentication middleware applies to every product route -------------
// No access token  -> 401 AUTH_REQUIRED
// Invalid token    -> 401 INVALID_TOKEN
router.use(authenticate);

/**
 * /api/products
 *   GET  -> list + filter + paginate        (any authenticated user)
 *   POST -> create                           (admin only -> 403 otherwise)
 */
router
  .route('/')
  .get(validate({ query: validateProductQuery }), listProducts)
  .post(authorize('admin'), validate({ body: validateCreateProduct }), createProduct)
  // Anything else (PUT / PATCH / DELETE on the collection) -> 405
  .all(methodNotAllowed(['GET', 'POST']));

/**
 * /api/products/:id      (path parameter)
 *   GET    -> read one                      (any authenticated user)
 *   PUT    -> full replace                  (admin only)
 *   PATCH  -> partial update                (admin only)
 *   DELETE -> remove                        (admin only)
 */
router
  .route('/:id')
  .all(validateUuidParam('id')) // malformed id -> 400 INVALID_ID
  .get(getProduct)
  .put(authorize('admin'), validate({ body: validateUpdateProduct }), replaceProduct)
  .patch(authorize('admin'), validate({ body: validatePatchProduct }), patchProduct)
  .delete(authorize('admin'), deleteProduct)
  // Anything else (e.g. POST /api/products/:id) -> 405
  .all(methodNotAllowed(['GET', 'PUT', 'PATCH', 'DELETE']));

export default router;
