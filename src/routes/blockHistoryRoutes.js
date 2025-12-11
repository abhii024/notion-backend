import express from 'express';
import { blockHistoryController } from '../controllers/blockHistoryController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
// import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
// router.use(authMiddleware);

// GET /api/history/page/:pageId - Get page history
router.get('/page/:pageId', asyncHandler(blockHistoryController.getPageHistory));

// GET /api/history/page/:pageId/entries - Get all timeline entries
router.get('/page/:pageId/entries', asyncHandler(blockHistoryController.getTimelineEntries));

// GET /api/history/page/:pageId/at/:historyId - Get page at specific history point
router.get('/page/:pageId/at/:historyId', asyncHandler(blockHistoryController.getPageAtHistory));

// GET /api/history/page/:pageId/recent - Get recent snapshots
router.get('/page/:pageId/recent', asyncHandler(blockHistoryController.getRecentSnapshots));

// POST /api/history/restore/:historyId - Restore to snapshot
router.post('/restore/:historyId', asyncHandler(blockHistoryController.restoreSnapshot));

// DELETE /api/history/cleanup - Cleanup old history (admin)
router.delete('/cleanup', asyncHandler(blockHistoryController.cleanupHistory));

export default router;