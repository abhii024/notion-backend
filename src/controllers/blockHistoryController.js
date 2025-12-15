import { BlockHistory } from '../models/BlockHistory.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { Page } from '../models/Page.js';

export const blockHistoryController = {
  // Get page history
  getPageHistory: asyncHandler(async (req, res) => {
    const { pageId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    // Check if page belongs to user
    const pageExists = await Page.findById(pageId);
    if (!pageExists) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }
    
    if (pageExists.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    const history = await BlockHistory.getPageHistory(
      pageId, 
      userId,
      parseInt(page), 
      parseInt(limit)
    );
    
    res.json({
      success: true,
      data: history
    });
  }),
  
  // Get ALL timeline entries
  getTimelineEntries: asyncHandler(async (req, res) => {
    const { pageId } = req.params;
    const { limit = 50 } = req.query;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    // Check if page belongs to user
    const pageExists = await Page.findById(pageId);
    if (!pageExists) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }
    
    if (pageExists.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    const entries = await BlockHistory.getTimelineEntries(pageId, userId, parseInt(limit));
    
    const formattedEntries = entries.map(entry => {
      const date = new Date(entry.created_at);
      
      let operationText = 'Updated';
      if (entry.operation === 'create') operationText = 'Created';
      if (entry.operation === 'delete') operationText = 'Deleted';
      if (entry.operation === 'snapshot') operationText = 'Saved';
      
      return {
        id: entry.id,
        timestamp: entry.created_at,
        date: date.toLocaleDateString(),
        time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        operation: entry.operation,
        operation_text: operationText,
        block_id: entry.block_id,
        block_type: entry.block_type,
        preview_content: entry.preview_content || '',
        preview: entry.preview || [],
        has_snapshot: entry.has_snapshot,
        has_block_data: entry.has_block_data
      };
    });
    
    res.json({
      success: true,
      data: formattedEntries
    });
  }),
  
  // Get page at specific history point
  getPageAtHistory: asyncHandler(async (req, res) => {
    const { pageId, historyId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    // Check if page belongs to user
    const pageExists = await Page.findById(pageId);
    if (!pageExists) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }
    
    if (pageExists.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    const pageData = await BlockHistory.getPageAtHistory(pageId, historyId, userId);
    
    if (!pageData) {
      return res.status(404).json({
        success: false,
        error: 'History entry not found'
      });
    }
    
    res.json({
      success: true,
      data: pageData
    });
  }),
  
  // Restore to specific snapshot
  restoreSnapshot: asyncHandler(async (req, res) => {
    const { historyId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    // Get the history entry
    const history = await BlockHistory.getHistoryById(historyId, userId);
    
    if (!history) {
      return res.status(404).json({
        success: false,
        error: 'History entry not found'
      });
    }
    
    // Check if it's a snapshot
    if (!history.snapshot_data || !history.snapshot_data.blocks) {
      return res.status(400).json({
        success: false,
        error: 'This is not a snapshot entry'
      });
    }
    
    // Check if page belongs to user
    const pageExists = await Page.findById(history.page_id);
    if (!pageExists || pageExists.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    res.json({
      success: true,
      message: 'Snapshot retrieved (restore would be implemented here)',
      data: {
        snapshot: history.snapshot_data,
        page_id: history.page_id,
        restored_at: new Date().toISOString()
      }
    });
  }),
  
  // Get recent snapshots for timeline
  getRecentSnapshots: asyncHandler(async (req, res) => {
    const { pageId } = req.params;
    const { limit = 20 } = req.query;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    // Check if page belongs to user
    const pageExists = await Page.findById(pageId);
    if (!pageExists) {
      return res.status(404).json({
        success: false,
        error: 'Page not found'
      });
    }
    
    if (pageExists.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    const snapshots = await BlockHistory.getRecentSnapshots(pageId, userId, parseInt(limit));
    
    const formattedSnapshots = snapshots.map(snapshot => {
      const date = new Date(snapshot.created_at);
      
      return {
        id: snapshot.id,
        timestamp: snapshot.created_at,
        date: date.toLocaleDateString(),
        time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        operation: snapshot.operation,
        preview: snapshot.snapshot_data?.blocks?.slice(0, 3).map(b => b.type) || []
      };
    });
    
    res.json({
      success: true,
      data: formattedSnapshots
    });
  }),
  
  // Cleanup old history for current user
  cleanupHistory: asyncHandler(async (req, res) => {
    const { days = 30 } = req.query;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }
    
    const deletedCount = await BlockHistory.cleanupOldHistory(parseInt(days), userId);
    
    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} old history entries`,
      deleted_count: deletedCount
    });
  })
};