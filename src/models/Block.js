import { pool } from '../config/database.js';
import crypto from 'crypto';

export class Block {
  static async create(blockData) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const query = `
      INSERT INTO blocks (page_id, type, properties, format, parent_id, order_index)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const values = [
      blockData.page_id,
      blockData.type,
      JSON.stringify(blockData.properties || {}),
      JSON.stringify(blockData.format || {}),
      blockData.parent_id || null,
      blockData.order_index || 0
    ];

    const [result] = await connection.query(query, values);
    const newId = result.insertId; 
    
    await connection.commit();
    
    const [rows] = await connection.query('SELECT * FROM blocks WHERE id = ?', [newId]);
    return rows[0];
    
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

  static async findByPageId(pageId) {
    const [rows] = await pool.query(
      'SELECT * FROM blocks WHERE page_id = ? ORDER BY order_index ASC',
      [pageId]
    );
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.query('SELECT * FROM blocks WHERE id = ?', [id]);
    return rows[0];
  }

  static async update(id, updates) {
    const fields = [];
    const values = [];
    
    Object.keys(updates).forEach(key => {
      if ((key === 'properties' || key === 'format') && updates[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(JSON.stringify(updates[key]));
      } else if (updates[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    });
    
    if (fields.length === 0) {
      throw new Error('No fields to update');
    }
    
    values.push(id);
    const query = `UPDATE blocks SET ${fields.join(', ')} WHERE id = ?`;
    
    await pool.query(query, values);
    
    const [rows] = await pool.query('SELECT * FROM blocks WHERE id = ?', [id]);
    return rows[0];
  }

  static async delete(id) {
    const [result] = await pool.query('DELETE FROM blocks WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  static async reorderBlocks(pageId, blocks) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      for (let i = 0; i < blocks.length; i++) {
        await connection.query(
          'UPDATE blocks SET order_index = ? WHERE id = ? AND page_id = ?',
          [i, blocks[i].id, pageId]
        );
      }
      
      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // NEW METHOD: Save multiple blocks for a page
  static async saveBlocks(pageId, blocks) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // First, delete existing blocks for this page
      await connection.query('DELETE FROM blocks WHERE page_id = ?', [pageId]);
      
      // Then insert new blocks in order (without providing IDs)
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
      
      // Get all newly created blocks
      const [newBlocks] = await connection.query(
        'SELECT * FROM blocks WHERE page_id = ? ORDER BY order_index ASC',
        [pageId]
      );
      
      return { success: true, count: blocks.length, blocks: newBlocks };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ALTERNATIVE METHOD: Update blocks intelligently (preserves block IDs)
  static async updateBlocks(pageId, blocks) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Get existing blocks for this page
      const [existingBlocks] = await connection.query(
        'SELECT id FROM blocks WHERE page_id = ?',
        [pageId]
      );
      
      const existingBlockIds = existingBlocks.map(b => b.id);
      const newBlockIds = blocks.filter(b => b.id).map(b => b.id);
      
      // Delete blocks that are no longer in the new blocks array
      const blocksToDelete = existingBlockIds.filter(id => !newBlockIds.includes(id));
      if (blocksToDelete.length > 0) {
        const placeholders = blocksToDelete.map(() => '?').join(',');
        await connection.query(
          `DELETE FROM blocks WHERE page_id = ? AND id IN (${placeholders})`,
          [pageId, ...blocksToDelete]
        );
      }
      
      // Insert or update blocks
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        
        if (block.id) {
          // Check if block exists
          const [existing] = await connection.query(
            'SELECT id FROM blocks WHERE id = ? AND page_id = ?',
            [block.id, pageId]
          );
          
          if (existing.length > 0) {
            // Update existing block
            await connection.query(
              `UPDATE blocks 
               SET type = ?, properties = ?, format = ?, parent_id = ?, order_index = ?
               WHERE id = ? AND page_id = ?`,
              [
                block.type,
                JSON.stringify(block.properties || {}),
                JSON.stringify(block.format || {}),
                block.parent_id || null,
                i,
                block.id,
                pageId
              ]
            );
          } else {
            // Insert block with provided ID
            await connection.query(
              `INSERT INTO blocks (id, page_id, type, properties, format, parent_id, order_index)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                block.id,
                pageId,
                block.type,
                JSON.stringify(block.properties || {}),
                JSON.stringify(block.format || {}),
                block.parent_id || null,
                i
              ]
            );
          }
        } else {
          // Insert new block without ID (database will generate it)
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
      }
      
      await connection.commit();
      return { success: true, count: blocks.length };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}