import { pool } from '../config/database.js';
import { BlockHistory } from './BlockHistory.js';

export class Block {
  static async create(blockData) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Require user_id
      if (!blockData.user_id) {
        throw new Error('user_id is required');
      }

      const query = `
        INSERT INTO blocks (user_id, page_id, type, properties, format, order_index)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      const values = [
        blockData.user_id,
        blockData.page_id,
        blockData.type,
        JSON.stringify(blockData.properties || {}),
        JSON.stringify(blockData.format || {}),
        blockData.order_index || 0
      ];

      const [result] = await connection.query(query, values);
      const newId = result.insertId;

      await connection.commit();

      // Save history
      setTimeout(async () => {
        try {
          await BlockHistory.create({
            user_id: blockData.user_id,
            page_id: blockData.page_id,
            block_id: newId,
            block_data: blockData,
            operation: 'create',
            created_by: blockData.user_id
          });
        } catch (historyError) {
          console.error('Failed to save block history:', historyError);
        }
      }, 100);

      const [rows] = await connection.query('SELECT * FROM blocks WHERE id = ?', [newId]);
      return rows[0];

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async findByPageId(pageId, userId = null) {
    let query = 'SELECT * FROM blocks WHERE page_id = ?';
    const params = [pageId];
    
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    
    query += ' ORDER BY order_index ASC';
    const [rows] = await pool.query(query, params);
    return rows;
  }

  static async update(id, updates, userId = null) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      let query = 'SELECT * FROM blocks WHERE id = ?';
      const params = [id];
      
      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      }

      const [currentBlock] = await connection.query(query, params);

      if (currentBlock.length === 0) {
        throw new Error('Block not found');
      }

      const block = currentBlock[0];
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
      if (userId) {
        values.unshift(userId);
        query = `UPDATE blocks SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`;
      } else {
        query = `UPDATE blocks SET ${fields.join(', ')} WHERE id = ?`;
      }

      await connection.query(query, values);
      await connection.commit();

      // Save history
      setTimeout(async () => {
        try {
          await BlockHistory.create({
            user_id: block.user_id,
            page_id: block.page_id,
            block_id: id,
            block_data: {
              old: block,
              new: { ...block, ...updates }
            },
            operation: 'update',
            created_by: block.user_id
          });
        } catch (historyError) {
          console.error('Failed to save block history:', historyError);
        }
      }, 100);

      const [rows] = await connection.query('SELECT * FROM blocks WHERE id = ?', [id]);
      return rows[0];

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async delete(id, userId = null) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      let query = 'SELECT * FROM blocks WHERE id = ?';
      const params = [id];
      
      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      }

      const [block] = await connection.query(query, params);

      if (block.length === 0) {
        throw new Error('Block not found');
      }

      // Save history
      await connection.query(
        'INSERT INTO block_history (user_id, page_id, block_id, block_data, operation, created_by) VALUES (?, ?, ?, ?, ?, ?)',
        [block[0].user_id, block[0].page_id, id, JSON.stringify(block[0]), 'delete', block[0].user_id]
      );

      let deleteQuery = 'DELETE FROM blocks WHERE id = ?';
      const deleteParams = [id];
      
      if (userId) {
        deleteQuery += ' AND user_id = ?';
        deleteParams.push(userId);
      }

      const [result] = await connection.query(deleteQuery, deleteParams);
      await connection.commit();
      return result.affectedRows > 0;

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async saveBlocks(pageId, blocks, userId, saveSnapshot = true) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      if (!userId) {
        throw new Error('user_id is required');
      }

      // Get current blocks
      const [currentBlocks] = await connection.query(
        'SELECT * FROM blocks WHERE page_id = ? AND user_id = ? ORDER BY order_index ASC',
        [pageId, userId]
      );

      // Delete existing blocks
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

      // Save snapshot
      if (saveSnapshot) {
        setTimeout(async () => {
          try {
            await BlockHistory.create({
              user_id: userId,
              page_id: pageId,
              block_data: {
                previous: currentBlocks,
                current: blocks
              },
              snapshot_data: {
                page_id: pageId,
                blocks: blocks,
                saved_at: new Date().toISOString(),
                user_id: userId
              },
              operation: 'snapshot',
              created_by: userId
            });
          } catch (historyError) {
            console.error('Failed to save snapshot:', historyError);
          }
        }, 100);
      }

      const [newBlocks] = await connection.query(
        'SELECT * FROM blocks WHERE page_id = ? AND user_id = ? ORDER BY order_index ASC',
        [pageId, userId]
      );

      return { success: true, count: blocks.length, blocks: newBlocks };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async updateBlocks(pageId, blocks, userId, saveSnapshot = true) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      if (!userId) {
        throw new Error('user_id is required');
      }

      // Get existing blocks
      const [existingBlocks] = await connection.query(
        'SELECT * FROM blocks WHERE page_id = ? AND user_id = ? ORDER BY order_index ASC',
        [pageId, userId]
      );

      const existingBlockIds = existingBlocks.map(b => b.id);
      const newBlockIds = blocks.filter(b => b.id).map(b => b.id);

      // Delete blocks that are no longer in the new blocks array
      const blocksToDelete = existingBlockIds.filter(id => !newBlockIds.includes(id));
      if (blocksToDelete.length > 0) {
        const placeholders = blocksToDelete.map(() => '?').join(',');
        await connection.query(
          `DELETE FROM blocks WHERE page_id = ? AND user_id = ? AND id IN (${placeholders})`,
          [pageId, userId, ...blocksToDelete]
        );
      }

      // Insert or update blocks
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];

        if (block.id) {
          // Check if block exists
          const [existing] = await connection.query(
            'SELECT * FROM blocks WHERE id = ? AND page_id = ? AND user_id = ?',
            [block.id, pageId, userId]
          );

          if (existing.length > 0) {
            // Update existing block
            await connection.query(
              `UPDATE blocks 
               SET type = ?, properties = ?, format = ?, order_index = ?
               WHERE id = ? AND page_id = ? AND user_id = ?`,
              [
                block.type,
                JSON.stringify(block.properties || {}),
                JSON.stringify(block.format || {}),
                i,
                block.id,
                pageId,
                userId
              ]
            );
          } else {
            // Insert block with provided ID
            await connection.query(
              `INSERT INTO blocks (id, user_id, page_id, type, properties, format, order_index)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                block.id,
                userId,
                pageId,
                block.type,
                JSON.stringify(block.properties || {}),
                JSON.stringify(block.format || {}),
                i
              ]
            );
          }
        } else {
          // Insert new block without ID
          const [result] = await connection.query(
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

          block.id = result.insertId;
        }
      }

      await connection.commit();

      // Save history
      try {
        const [updatedBlocks] = await connection.query(
          'SELECT * FROM blocks WHERE page_id = ? AND user_id = ? ORDER BY order_index ASC',
          [pageId, userId]
        );

        if (saveSnapshot) {
          await BlockHistory.create({
            user_id: userId,
            page_id: pageId,
            block_data: {
              previous: existingBlocks,
              current: updatedBlocks
            },
            snapshot_data: {
              page_id: pageId,
              blocks: updatedBlocks,
              saved_at: new Date().toISOString(),
              user_id: userId,
              change_count: blocks.length - existingBlocks.length
            },
            operation: 'snapshot',
            created_by: userId
          });
        }
      } catch (historyError) {
        console.error('Failed to save history:', historyError);
      }

      const [updatedBlocks] = await connection.query(
        'SELECT * FROM blocks WHERE page_id = ? AND user_id = ? ORDER BY order_index ASC',
        [pageId, userId]
      );

      return {
        success: true,
        count: blocks.length,
        blocks: updatedBlocks
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}