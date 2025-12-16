import express from 'express';
import { pageController } from '../controllers/pageController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.get('/slug/:slug', asyncHandler(pageController.getPageBySlug));
router.get('/slug/:slug/id', asyncHandler(pageController.getPageIdFromSlug)); // Get ID from slug
router.get('/:id', asyncHandler(pageController.getPage)); // Works with both ID and slug

// Protected routes
router.use(authMiddleware);

// Page management
router.get('/', asyncHandler(pageController.getAllPages));
router.post('/', asyncHandler(pageController.createPage));
router.put('/:id', asyncHandler(pageController.updatePage));
router.delete('/:id', asyncHandler(pageController.deletePage));

// Search and tree
router.get('/search', asyncHandler(pageController.searchPages));
router.get('/tree', asyncHandler(pageController.getPageTree));
router.get('/user/pages', asyncHandler(pageController.getPagesByUser));

export default router;