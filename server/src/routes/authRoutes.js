import { Router } from 'express';
import { login, logout, me, refresh, register } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  validateLogin,
  validateLogout,
  validateRefresh,
  validateRegister,
} from '../validators/authValidators.js';

/** ===== /api/auth ===== */

const router = Router();

// POST /api/auth/register -> create an account, returns 201 + access/refresh pair
router.post('/register', validate({ body: validateRegister }), register);

// POST /api/auth/login -> exchange credentials for an access/refresh pair
router.post('/login', validate({ body: validateLogin }), login);

// POST /api/auth/refresh -> exchange a refresh token for a new pair (rotates it)
router.post('/refresh', validate({ body: validateRefresh }), refresh);

// POST /api/auth/logout -> revoke the access token (header) + refresh token (body)
router.post('/logout', validate({ body: validateLogout }), logout);

// GET /api/auth/me -> inspect the current token (authentication demo)
router.get('/me', authenticate, me);

export default router;
