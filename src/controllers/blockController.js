import { Block } from '../models/Block.js';
import { Page } from '../models/Page.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { pool } from '../config/database.js'; // Add this import

export const blockController = {
  // Get blocks for a page
  getPageBlocks: asyncHandler(async (req, res) => {
    const { pageId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    // Check if page exists and belongs to user
    const page = await Page.findById(pageId);
    if (!page) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }
    
    if (page.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    const blocks = await Block.findByPageId(pageId, userId);
    
    res.json({
      success: true,
      count: blocks.length,
      data: blocks
    });
  }),

  // Save blocks for a page
  savePageBlocks: asyncHandler(async (req, res) => {
    const { pageId } = req.params;
    const { blocks, saveHistory = true } = req.body;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    if (!Array.isArray(blocks)) {
      return res.status(400).json({
        success: false,
        error: 'Blocks must be an array'
      });
    }
    
    // Check if page exists and belongs to user
    const page = await Page.findById(pageId);
    if (!page) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }
    
    if (page.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    const result = await Block.saveBlocks(pageId, blocks, userId, saveHistory);
    
    res.json({
      success: true,
      message: 'Blocks saved successfully',
      count: result.count
    });
  }),

  // Update a block
  updateBlock: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const updatedBlock = await Block.update(id, updates, userId);
    
    if (!updatedBlock) {
      return res.status(404).json({
        success: false,
        error: 'Block not found or access denied'
      });
    }
    
    res.json({
      success: true,
      data: updatedBlock
    });
  }),

  // Delete a block
  deleteBlock: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const deleted = await Block.delete(id, userId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Block not found or access denied'
      });
    }
    
    res.json({
      success: true,
      message: 'Block deleted successfully'
    });
  }),

  // Reorder blocks
  reorderBlocks: asyncHandler(async (req, res) => {
    const { pageId } = req.params;
    const { blockIds } = req.body;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    if (!Array.isArray(blockIds)) {
      return res.status(400).json({
        success: false,
        error: 'blockIds must be an array'
      });
    }
    
    // Check if page exists and belongs to user
    const page = await Page.findById(pageId);
    if (!page) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }
    
    if (page.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    const blocks = await Block.findByPageId(pageId, userId);
    
    // Reorder blocks based on provided IDs
    const reorderedBlocks = blockIds.map((blockId, index) => {
      const block = blocks.find(b => b.id === blockId);
      if (block) {
        return { ...block, order_index: index };
      }
      return null;
    }).filter(Boolean);
    
    // Save reordered blocks
    const result = await Block.saveBlocks(pageId, reorderedBlocks, userId, false);
    
    res.json({
      success: true,
      message: 'Blocks reordered successfully'
    });
  }),

  // Create a single block
  createBlock: asyncHandler(async (req, res) => {
    const blockData = req.body;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    // Validate required fields
    if (!blockData.page_id || !blockData.type) {
      return res.status(400).json({
        success: false,
        error: 'page_id and type are required'
      });
    }
    
    // Check if page exists and belongs to user
    const page = await Page.findById(blockData.page_id);
    if (!page) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }
    
    if (page.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    // Set default order_index if not provided
    if (blockData.order_index === undefined) {
      const blocks = await Block.findByPageId(blockData.page_id, userId);
      blockData.order_index = blocks.length;
    }
    
    // Add user_id to block data
    const newBlock = await Block.create({
      ...blockData,
      user_id: userId
    });
    
    res.status(201).json({
      success: true,
      data: newBlock
    });
  }),

  // Update all blocks for a page (Ctrl+S save)
  updatePageBlocks: asyncHandler(async (req, res) => {
    const { pageId } = req.params;
    const { blocks, saveHistory = true } = req.body;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    if (!Array.isArray(blocks)) {
      return res.status(400).json({
        success: false,
        error: 'Blocks must be an array'
      });
    }
    
    // Check if page exists and belongs to user
    const page = await Page.findById(pageId);
    if (!page) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }
    
    if (page.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    // Use optimized updateBlocks method
    const result = await Block.updateBlocks(pageId, blocks, userId, saveHistory);
    
    res.json({
      success: true,
      message: 'Blocks updated successfully',
      count: result.count
    });
  }),
  
  // Simple save without history (for internal use)
  saveBlocksSimple: asyncHandler(async (req, res) => {
    const { pageId } = req.params;
    const { blocks } = req.body;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    if (!Array.isArray(blocks)) {
      return res.status(400).json({
        success: false,
        error: 'Blocks must be an array'
      });
    }
    
    // Check if page exists and belongs to user
    const page = await Page.findById(pageId);
    if (!page) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }
    
    if (page.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Delete existing blocks for this user
      await connection.query('DELETE FROM blocks WHERE page_id = ? AND user_id = ?', [pageId, userId]);
      
      // Insert new blocks
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        
        await connection.query(
          `INSERT INTO blocks (user_id, page_id, type, properties, format, order_index)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            userId,
            pageId,
            block.type,
            JSON.stringify(block.properties || {}),
            JSON.stringify(block.format || {}),
            i
          ]
        );
      }
      
      await connection.commit();
      
      res.json({
        success: true,
        message: 'Blocks saved successfully',
        count: blocks.length
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
};