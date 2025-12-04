import { pool } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

export class Block {
  static async create({ page_id, type, properties = {}, format = {}, parent_id = null, order_index = 0 }) {
    const id = uuidv4();
    const query = `
      INSERT INTO blocks (id, page_id, type, properties, format, parent_id, order_index)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const values = [id, page_id, type, properties, format, parent_id, order_index];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findByPageId(pageId) {
    const query = `
      SELECT * FROM blocks 
      WHERE page_id = $1 
      ORDER BY parent_id NULLS FIRST, order_index, created_at
    `;
    const result = await pool.query(query, [pageId]);
    return result.rows;
  }

  static async saveBlocks(pageId, blocks) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Delete existing blocks for this page
      await client.query('DELETE FROM blocks WHERE page_id = $1', [pageId]);
      
      // Insert new blocks
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        await client.query(
          `INSERT INTO blocks (id, page_id, type, properties, format, parent_id, order_index)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            block.id || uuidv4(),
            pageId,
            block.type,
            block.properties || {},
            block.format || {},
            block.parent_id || null,
            i
          ]
        );
      }
      
      // Update page timestamp
      await client.query(
        'UPDATE pages SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [pageId]
      );
      
      await client.query('COMMIT');
      return { success: true, message: 'Blocks saved successfully', count: blocks.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async update(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    const allowedFields = ['type', 'properties', 'format', 'parent_id', 'order_index'];
    
    Object.entries(updates).forEach(([key, value]) => {
      if (allowedFields.includes(key) && value !== undefined) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const query = `
      UPDATE blocks 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async delete(id) {
    const query = 'DELETE FROM blocks WHERE id = $1 RETURNING id';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async deleteByPageId(pageId) {
    const query = 'DELETE FROM blocks WHERE page_id = $1 RETURNING COUNT(*)';
    const result = await pool.query(query, [pageId]);
    return parseInt(result.rows[0].count);
  }

  static async reorderBlocks(pageId, blockIds) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (let i = 0; i < blockIds.length; i++) {
        await client.query(
          'UPDATE blocks SET order_index = $1 WHERE id = $2 AND page_id = $3',
          [i, blockIds[i], pageId]
        );
      }
      
      await client.query('COMMIT');
      return { success: true, message: 'Blocks reordered successfully' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}