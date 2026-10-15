import { ApiError } from '../utils/ApiError.js';

/**
 * ===== Validation middleware =====
 *
 * Usage:
 *
 *   router.post('/products',
 *     validate({ body: validateCreateProduct }),
 *     controller);
 *
 * For every key you pass (`body`, `query`, `params`), the matching validator is
 * run. If *any* validator reports errors they are merged into one 422 response
 * so the client can show every problem at once instead of fixing them one by
 * one. When validation passes, `req[target]` is replaced with the normalised
 * value produced by the validator.
 */
export function validate(validators) {
  return function validateMiddleware(req, res, next) {
    const details = [];

    for (const [target, validator] of Object.entries(validators)) {
      const result = validator(req[target] ?? {});

      // A validator must return { value, errors } - fail loudly if it doesn't,
      // because that is a programming mistake, not a client mistake.
      if (!result || typeof result !== 'object' || !Array.isArray(result.errors)) {
        return next(new Error(`Validator for "${target}" must return { value, errors }`));
      }

      if (result.errors.length > 0) {
        details.push(...result.errors.map((error) => ({ in: target, ...error })));
        continue;
      }

      if (result.value !== undefined) {
        req[target] = result.value;
      }
    }

    if (details.length > 0) {
      return next(
        new ApiError(
          422,
          'VALIDATION_ERROR',
          `${details.length} validation error(s) found in the request`,
          details,
        ),
      );
    }

    return next();
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ===== Path-parameter validation =====
 *
 * `/api/products/not-a-uuid` is a *bad request* (400), while
 * `/api/products/9f1c...` with an unknown UUID is a *not found* (404).
 * Checking the format up-front keeps that distinction honest.
 */
export function validateUuidParam(name = 'id') {
  return function validateUuidParamMiddleware(req, res, next) {
    const value = req.params[name];

    if (!UUID_RE.test(String(value ?? ''))) {
      return next(
        new ApiError(400, 'INVALID_ID', `"${value}" is not a valid ${name}: expected a UUID`, [
          { in: 'params', field: name, message: 'must be a valid UUID' },
        ]),
      );
    }

    return next();
  };
}

export default validate;
