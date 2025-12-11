import { pool } from '../config/database.js';
import { BlockHistory } from './BlockHistory.js';

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

      // Save history AFTER committing
      setTimeout(async () => {
        try {
          await BlockHistory.create({
            page_id: blockData.page_id,
            block_id: newId,
            block_data: blockData,
            operation: 'create',
            created_by: 'system'
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

  static async findByPageId(pageId) {
    const [rows] = await pool.query(
      'SELECT * FROM blocks WHERE page_id = ? ORDER BY order_index ASC',
      [pageId]
    );
    return rows;
  }

  static async update(id, updates) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Get current block data for history
      const [currentBlock] = await connection.query(
        'SELECT * FROM blocks WHERE id = ?',
        [id]
      );

      if (currentBlock.length === 0) {
        throw new Error('Block not found');
      }

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

      await connection.query(query, values);

      await connection.commit();

      // Save history AFTER committing
      setTimeout(async () => {
        try {
          await BlockHistory.create({
            page_id: currentBlock[0].page_id,
            block_id: id,
            block_data: {
              old: currentBlock[0],
              new: { ...currentBlock[0], ...updates }
            },
            operation: 'update',
            created_by: 'system'
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

  static async delete(id) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Get block data before deletion for history
    const [block] = await connection.query('SELECT * FROM blocks WHERE id = ?', [id]);

    if (block.length === 0) {
      throw new Error('Block not found');
    }

    // Save history BEFORE deletion
    await connection.query(
      'INSERT INTO block_history (page_id, block_id, block_data, operation, created_by) VALUES (?, ?, ?, ?, ?)',
      [block[0].page_id, id, JSON.stringify(block[0]), 'delete', 'system']
    );

    const [result] = await connection.query('DELETE FROM blocks WHERE id = ?', [id]);

    await connection.commit();
    return result.affectedRows > 0;

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

  // Save blocks with history
  static async saveBlocks(pageId, blocks, userId = 'system', saveSnapshot = true) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Get current blocks before update
      const [currentBlocks] = await connection.query(
        'SELECT * FROM blocks WHERE page_id = ? ORDER BY order_index ASC',
        [pageId]
      );

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

      // Save snapshot to history if requested
      if (saveSnapshot) {
        setTimeout(async () => {
          try {
            await BlockHistory.create({
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

  static async updateBlocks(pageId, blocks, userId = 'system', saveSnapshot = true) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Get existing blocks for this page
      const [existingBlocks] = await connection.query(
        'SELECT * FROM blocks WHERE page_id = ? ORDER BY order_index ASC',
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
            'SELECT * FROM blocks WHERE id = ? AND page_id = ?',
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
          // Insert new block without ID
          const [result] = await connection.query(
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

          block.id = result.insertId;
        }
      }

      await connection.commit();

      // Save history AFTER committing to avoid deadlocks
      try {
        // Get updated blocks for history
        const [updatedBlocks] = await connection.query(
          'SELECT * FROM blocks WHERE page_id = ? ORDER BY order_index ASC',
          [pageId]
        );

        // Save snapshot to history if requested
        if (saveSnapshot) {
          await BlockHistory.create({
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
        console.error('Failed to save history (non-critical):', historyError);
        // Don't throw - history is important but shouldn't break the main operation
      }

      // Get updated blocks for response
      const [updatedBlocks] = await connection.query(
        'SELECT * FROM blocks WHERE page_id = ? ORDER BY order_index ASC',
        [pageId]
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