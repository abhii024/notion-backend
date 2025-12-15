import express from 'express';
import { pageController } from '../controllers/pageController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes (accessible without authentication)


// Protected routes (require authentication)
router.get('/:id', asyncHandler(pageController.getPage));
router.use(authMiddleware); // Apply auth to all routes below
router.get('/search', asyncHandler(pageController.searchPages));
router.get('/slug/:slug', asyncHandler(pageController.getPageBySlug));
// GET /api/pages - Get all pages (protected)
router.get('/', asyncHandler(pageController.getAllPages));

// GET /api/pages/tree - Get page hierarchy (protected)
router.get('/tree', asyncHandler(pageController.getPageTree));

// POST /api/pages - Create new page (protected)
router.post('/', asyncHandler(pageController.createPage));

// PUT /api/pages/:id - Update page (protected)
router.put('/:id', asyncHandler(pageController.updatePage));

// DELETE /api/pages/:id - Delete page (protected)
router.delete('/:id', asyncHandler(pageController.deletePage));

export default router;