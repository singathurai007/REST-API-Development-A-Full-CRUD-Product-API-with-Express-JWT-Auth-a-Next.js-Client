import { Router } from 'express';
import authRoutes from './authRoutes.js';
import productRoutes from './productRoutes.js';
import { CATEGORIES, db } from '../data/store.js';

/** ===== /api router ===== */

const router = Router();

/**
 * GET /api - tiny discovery document.
 * Useful when you open http://localhost:4000/api in a browser or Postman.
 */
router.get('/', (req, res) => {
  res.status(200).json({
    data: {
      name: 'REST API Development - practical project',
      version: '1.0.0',
      docs: 'See README.md and postman/REST-API-Development.postman_collection.json',
      resources: { users: db.users.length, products: db.products.length },
      endpoints: {
        health: 'GET /api/health',
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        refresh: 'POST /api/auth/refresh',
        logout: 'POST /api/auth/logout',
        currentUser: 'GET /api/auth/me',
        listProducts: 'GET /api/products?page=1&limit=10&search=&category=&sort=price&order=asc',
        getProduct: 'GET /api/products/:id',
        createProduct: 'POST /api/products',
        replaceProduct: 'PUT /api/products/:id',
        updateProduct: 'PATCH /api/products/:id',
        deleteProduct: 'DELETE /api/products/:id',
      },
      auth:
        'All /api/products routes need "Authorization: Bearer <token>". Writes need the admin role. ' +
        'Login/register return a short-lived access token plus a long-lived refresh token; ' +
        'POST /api/auth/refresh exchanges the refresh token for a new pair and POST /api/auth/logout revokes both.',
      categories: CATEGORIES,
    },
  });
});

/** GET /api/health - liveness probe, no auth required. */
router.get('/health', (req, res) => {
  res.status(200).json({
    data: {
      status: 'ok',
      uptimeSeconds: Number(process.uptime().toFixed(1)),
      environment: process.env.NODE_ENV ?? 'development',
      timestamp: new Date().toISOString(),
    },
  });
});

router.use('/auth', authRoutes);
router.use('/products', productRoutes);

export default router;
