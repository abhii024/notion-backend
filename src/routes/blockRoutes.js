import express from 'express';
import { blockController } from '../controllers/blockController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// GET /api/blocks/page/:pageId - Get blocks for a page
router.get('/page/:pageId', asyncHandler(blockController.getPageBlocks));

// POST /api/blocks/page/:pageId - Save blocks for a page
router.post('/page/:pageId', asyncHandler(blockController.savePageBlocks));

// PUT /api/blocks/page/:pageId - Update all blocks for a page (Ctrl+S)
router.put('/page/:pageId', asyncHandler(blockController.updatePageBlocks));

// PUT /api/blocks/reorder/:pageId - Reorder blocks
router.put('/reorder/:pageId', asyncHandler(blockController.reorderBlocks));

// PUT /api/blocks/:id - Update a single block
router.put('/:id', asyncHandler(blockController.updateBlock));

// DELETE /api/blocks/:id - Delete a block
router.delete('/:id', asyncHandler(blockController.deleteBlock));

// POST /api/blocks/create - Create a new block
router.post('/create', asyncHandler(blockController.createBlock));

export default router;