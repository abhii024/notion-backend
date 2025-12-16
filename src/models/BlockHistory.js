import { pool } from '../config/database.js';

export class BlockHistory {
  static async create(historyData) {
    try {
      const connection = await pool.getConnection();
      
      try {
        // Require user_id
        if (!historyData.user_id) {
          throw new Error('user_id is required');
        }

        const query = `
          INSERT INTO block_history 
          (user_id, page_id, block_id, block_data, operation, snapshot_data, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        
        const values = [
          historyData.user_id,
          historyData.page_id,
          historyData.block_id || null,
          JSON.stringify(historyData.block_data || {}),
          historyData.operation || 'update',
          JSON.stringify(historyData.snapshot_data || {}),
          historyData.created_by || historyData.user_id
        ];
        
        const [result] = await connection.query(query, values);
        return result.insertId;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('History save failed:', error.message);
      return null;
    }
  }
  
  static safeParseJSON(data) {
    if (!data) return {};
    if (typeof data === 'object') return data;
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return {};
      }
    }
    return {};
  }
  
  static async getPageHistory(pageId, userId, page = 1, limit = 20) {
    try {
      const offset = (page - 1) * limit;
      
      const [rows] = await pool.query(`
        SELECT 
          h.*,
          b.type as block_type,
          p.title as page_title
        FROM block_history h
        LEFT JOIN blocks b ON h.block_id = b.id
        LEFT JOIN pages p ON h.page_id = p.id
        WHERE h.page_id = ? AND h.user_id = ?
        ORDER BY h.created_at DESC
        LIMIT ? OFFSET ?
      `, [pageId, userId, limit, offset]);
      
      const [countRows] = await pool.query(
        'SELECT COUNT(*) as total FROM block_history WHERE page_id = ? AND user_id = ?',
        [pageId, userId]
      );
      
      return {
        history: rows.map(row => ({
          ...row,
          block_data: this.safeParseJSON(row.block_data),
          snapshot_data: this.safeParseJSON(row.snapshot_data)
        })),
        total: countRows[0].total,
        page,
        limit,
        totalPages: Math.ceil(countRows[0].total / limit)
      };
    } catch (error) {
      console.error('Failed to get page history:', error);
      return {
        history: [],
        total: 0,
        page,
        limit,
        totalPages: 0
      };
    }
  }
  
  static async getTimelineEntries(pageId, userId, limit = 50) {
    try {
      const [rows] = await pool.query(`
        SELECT 
          h.id,
          h.created_at,
          h.operation,
          h.snapshot_data,
          h.block_data,
          h.block_id,
          b.type as block_type
        FROM block_history h
        LEFT JOIN blocks b ON h.block_id = b.id
        WHERE h.page_id = ? AND h.user_id = ?
          AND (h.snapshot_data IS NOT NULL OR h.block_data IS NOT NULL)
          AND (h.snapshot_data != '{}' OR h.block_data != '{}')
        ORDER BY h.created_at DESC
        LIMIT ?
      `, [pageId, userId, limit]);
      
      if (rows.length === 0) return [];
      
      return rows.map(row => {
        const snapshotData = this.safeParseJSON(row.snapshot_data);
        const blockData = this.safeParseJSON(row.block_data);
        
        let previewContent = '';
        let blockTypes = [];
        
        if (snapshotData && snapshotData.blocks) {
          blockTypes = snapshotData.blocks.slice(0, 3).map(b => b.type);
          if (snapshotData.blocks[0] && snapshotData.blocks[0].properties) {
            const props = snapshotData.blocks[0].properties;
            if (props.title && Array.isArray(props.title) && props.title[0]) {
              previewContent = props.title[0][0] || '';
            }
          }
        } else if (blockData) {
          if (blockData.new) {
            const props = blockData.new.properties || {};
            if (props.title && Array.isArray(props.title) && props.title[0]) {
              previewContent = props.title[0][0] || '';
            }
          } else if (blockData.old) {
            const props = blockData.old.properties || {};
            if (props.title && Array.isArray(props.title) && props.title[0]) {
              previewContent = props.title[0][0] || '';
            }
          }
          
          if (row.block_type) {
            blockTypes = [row.block_type];
          }
        }
        
        return {
          id: row.id,
          created_at: row.created_at,
          operation: row.operation || 'update',
          block_id: row.block_id,
          block_type: row.block_type,
          has_snapshot: !!snapshotData && !!snapshotData.blocks,
          has_block_data: !!blockData && (!!blockData.new || !!blockData.old),
          preview_content: previewContent,
          preview: blockTypes,
          snapshot_data: snapshotData,
          block_data: blockData
        };
      });
    } catch (error) {
      console.error('Failed to get timeline entries:', error);
      return [];
    }
  }
  
  static async getPageAtHistory(pageId, historyId, userId) {
    try {
      const [historyRows] = await pool.query(`
        SELECT 
          h.*,
          p.title as page_title,
          p.icon as page_icon,
          p.cover_image as page_cover
        FROM block_history h
        LEFT JOIN pages p ON h.page_id = p.id
        WHERE h.id = ? AND h.page_id = ? 
      `, [historyId, pageId]);
      
      if (historyRows.length === 0) {
        return null;
      }
      
      const history = historyRows[0];
      const snapshotData = this.safeParseJSON(history.snapshot_data);
      
      let blocks = [];
      let isFullSnapshot = false;
      
      if (snapshotData && snapshotData.blocks) {
        blocks = snapshotData.blocks;
        isFullSnapshot = true;
      } else {
        const [currentBlocks] = await pool.query(
          'SELECT * FROM blocks WHERE page_id = ? AND user_id = ? ORDER BY order_index ASC',
          [pageId, userId]
        );
        blocks = currentBlocks;
      }
      
      return {
        page: {
          id: pageId,
          title: history.page_title || 'Untitled',
          icon: history.page_icon || '📄',
          cover_image: history.page_cover || null
        },
        blocks: blocks,
        is_historical: true,
        history_id: history.id,
        snapshot_time: history.created_at,
        operation: history.operation,
        is_full_snapshot: isFullSnapshot,
        snapshot_data: snapshotData
      };
    } catch (error) {
      console.error('Failed to get page at history:', error);
      return null;
    }
  }
  
  static async getRecentSnapshots(pageId, userId, limit = 20) {
    try {
      const [rows] = await pool.query(`
        SELECT 
          h.id,
          h.created_at,
          h.operation,
          h.snapshot_data
        FROM block_history h
        WHERE h.page_id = ? AND h.user_id = ?
          AND h.snapshot_data IS NOT NULL
          AND h.snapshot_data != '{}'
        ORDER BY h.created_at DESC
        LIMIT ?
      `, [pageId, userId, limit]);

      return rows.map(row => ({
        ...row,
        snapshot_data: this.safeParseJSON(row.snapshot_data),
        change_count: 1
      }));
    } catch (error) {
      console.error('Failed to get recent snapshots:', error);
      return [];
    }
  }
  
  static async getHistoryById(historyId, userId) {
    try {
      const [rows] = await pool.query(`
        SELECT 
          h.*,
          b.type as block_type,
          p.title as page_title
        FROM block_history h
        LEFT JOIN blocks b ON h.block_id = b.id
        LEFT JOIN pages p ON h.page_id = p.id
        WHERE h.id = ? AND h.user_id = ?
      `, [historyId, userId]);
      
      if (rows.length === 0) return null;
      
      return {
        ...rows[0],
        block_data: this.safeParseJSON(rows[0].block_data),
        snapshot_data: this.safeParseJSON(rows[0].snapshot_data)
      };
    } catch (error) {
      console.error('Failed to get history by ID:', error);
      return null;
    }
  }
  
  static async cleanupOldHistory(daysToKeep = 30, userId = null) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      let query = 'DELETE FROM block_history WHERE created_at < ?';
      const params = [cutoffDate];
      
      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      }
      
      const [result] = await pool.query(query, params);
      return result.affectedRows;
    } catch (error) {
      console.error('Failed to cleanup old history:', error);
      return 0;
    }
  }
}