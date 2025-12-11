import { Block } from '../models/Block.js';
import { Page } from '../models/Page.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const blockController = {
  // Get blocks for a page
  getPageBlocks: asyncHandler(async (req, res) => {
    const { pageId } = req.params;
    
    // Check if page exists
    const page = await Page.findById(pageId);
    if (!page) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }
    
    const blocks = await Block.findByPageId(pageId);
    
    res.json({
      success: true,
      count: blocks.length,
      data: blocks
    });
  }),

  // Save blocks for a page (with optimized transactions)
  savePageBlocks: asyncHandler(async (req, res) => {
    const { pageId } = req.params;
    const { blocks, saveHistory = true } = req.body;
    
    if (!Array.isArray(blocks)) {
      return res.status(400).json({
        success: false,
        error: 'Blocks must be an array'
      });
    }
    
    // Check if page exists
    const page = await Page.findById(pageId);
    if (!page) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }
    
    const result = await Block.saveBlocks(pageId, blocks, 'user', saveHistory);
    
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
    
    const updatedBlock = await Block.update(id, updates);
    
    if (!updatedBlock) {
      return res.status(404).json({
        success: false,
        error: 'Block not found'
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
    
    const deleted = await Block.delete(id);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Block not found'
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
    
    if (!Array.isArray(blockIds)) {
      return res.status(400).json({
        success: false,
        error: 'blockIds must be an array'
      });
    }
    
    // Check if page exists
    const page = await Page.findById(pageId);
    if (!page) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }
    
    // This is a simplified version - you might need to implement this differently
    // based on how you want to handle reordering with history
    const blocks = await Block.findByPageId(pageId);
    
    // Reorder blocks based on provided IDs
    const reorderedBlocks = blockIds.map((blockId, index) => {
      const block = blocks.find(b => b.id === blockId);
      if (block) {
        return { ...block, order_index: index };
      }
      return null;
    }).filter(Boolean);
    
    // Save reordered blocks
    const result = await Block.saveBlocks(pageId, reorderedBlocks, 'user', false);
    
    res.json({
      success: true,
      message: 'Blocks reordered successfully'
    });
  }),

  // Create a single block (optimized)
  createBlock: asyncHandler(async (req, res) => {
    const blockData = req.body;
    
    // Validate required fields
    if (!blockData.page_id || !blockData.type) {
      return res.status(400).json({
        success: false,
        error: 'page_id and type are required'
      });
    }
    
    // Check if page exists
    const page = await Page.findById(blockData.page_id);
    if (!page) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }
    
    // Set default order_index if not provided
    if (blockData.order_index === undefined) {
      const blocks = await Block.findByPageId(blockData.page_id);
      blockData.order_index = blocks.length;
    }
    
    const newBlock = await Block.create(blockData);
    
    res.status(201).json({
      success: true,
      data: newBlock
    });
  }),

  // Update all blocks for a page (Ctrl+S save) - optimized
  updatePageBlocks: asyncHandler(async (req, res) => {
    const { pageId } = req.params;
    const { blocks, saveHistory = true } = req.body;
    
    if (!Array.isArray(blocks)) {
      return res.status(400).json({
        success: false,
        error: 'Blocks must be an array'
      });
    }
    
    // Check if page exists
    const page = await Page.findById(pageId);
    if (!page) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }
    
    // Use optimized updateBlocks method
    const result = await Block.updateBlocks(pageId, blocks, 'user', saveHistory);
    
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
    
    if (!Array.isArray(blocks)) {
      return res.status(400).json({
        success: false,
        error: 'Blocks must be an array'
      });
    }
    
    // Check if page exists
    const page = await Page.findById(pageId);
    if (!page) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }
    
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Delete existing blocks
      await connection.query('DELETE FROM blocks WHERE page_id = ?', [pageId]);
      
      // Insert new blocks
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        
        await connection.query(
          `INSERT INTO blocks (page_id, type, properties, format, parent_id, order_index)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            pageId,
            block.type,
            JSON.stringify(block.properties || {}),
            JSON.stringify(block.format || {}),
            block.parent_id || null,
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