import { Router } from 'express';
import { login, me, register } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { validateLogin, validateRegister } from '../validators/authValidators.js';

/** ===== /api/auth ===== */

const router = Router();

// POST /api/auth/register -> create an account, returns 201 + JWT
router.post('/register', validate({ body: validateRegister }), register);

// POST /api/auth/login -> exchange credentials for a JWT
router.post('/login', validate({ body: validateLogin }), login);

// GET /api/auth/me -> inspect the current token (authentication demo)
router.get('/me', authenticate, me);

export default router;
