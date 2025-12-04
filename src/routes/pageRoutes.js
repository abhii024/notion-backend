import express from 'express';
import { pageController } from '../controllers/pageController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// GET /api/pages - Get all pages
router.get('/', asyncHandler(pageController.getAllPages));

// GET /api/pages/search - Search pages
router.get('/search', asyncHandler(pageController.searchPages));

// GET /api/pages/tree - Get page hierarchy
router.get('/tree', asyncHandler(pageController.getPageTree));

// GET /api/pages/:id - Get single page
router.get('/:id', asyncHandler(pageController.getPage));

// POST /api/pages - Create new page
router.post('/', asyncHandler(pageController.createPage));

// PUT /api/pages/:id - Update page
router.put('/:id', asyncHandler(pageController.updatePage));

// DELETE /api/pages/:id - Delete page
router.delete('/:id', asyncHandler(pageController.deletePage));

export default router;