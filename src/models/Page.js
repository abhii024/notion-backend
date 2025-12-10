
import { pool } from '../config/database.js';

export class Page {
 static async create(pageData) {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const query = `
      INSERT INTO pages (title, content, parent_id, icon, cover_image)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    const values = [
      pageData.title || 'Untitled',
      JSON.stringify(pageData.content || {}),
      pageData.parent_id || null,
      pageData.icon || '📄',
      pageData.cover_image || null
    ];

    const [result] = await connection.query(query, values);
    const newId = result.insertId; 
    
    await connection.commit();
    
    return await this.findById(newId);
    
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

  static async createAlternative(pageData) {
    const query = `
      INSERT INTO pages (title, content, parent_id, icon, cover_image)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    const values = [
      pageData.title || 'Untitled',
      JSON.stringify(pageData.content || {}),
      pageData.parent_id || null,
      pageData.icon || '📄',
      pageData.cover_image || null
    ];

    const [result] = await pool.query(query, values);
    
    const [rows] = await pool.query(
      'SELECT * FROM pages ORDER BY created_at DESC LIMIT 1'
    );
    
    return rows[0];
  }

  static async createBestPractice(pageData) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      const [uuidResult] = await connection.query('SELECT UUID() as uuid');
      const newId = uuidResult[0].uuid;
      
      const query = `
        INSERT INTO pages (id, title, content, parent_id, icon, cover_image)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      const values = [
        newId,
        pageData.title || 'Untitled',
        JSON.stringify(pageData.content || {}),
        pageData.parent_id || null,
        pageData.icon || '📄',
        pageData.cover_image || null
      ];

      await connection.query(query, values);
      
      const [rows] = await connection.query('SELECT * FROM pages WHERE id = ?', [newId]);
      
      await connection.commit();
      return rows[0];
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async findById(id) {
    const [rows] = await pool.query('SELECT * FROM pages WHERE id = ?', [id]);
    return rows[0];
  }

  static async findAll(parentId = null) {
    let query = 'SELECT * FROM pages';
    let params = [];
    
    if (parentId === null) {
      query += ' WHERE parent_id IS NULL';
    } else if (parentId !== undefined) {
      query += ' WHERE parent_id = ?';
      params.push(parentId);
    }
    
    query += ' ORDER BY created_at DESC';
    const [rows] = await pool.query(query, params);
    return rows;
  }

  static async update(id, updates) {
    // Map camelCase field names to snake_case database column names
    const fieldMappings = {
      coverImage: 'cover_image'
      // Add other mappings if needed
    };
    
    // Build dynamic update query
    const fields = [];
    const values = [];
    
    Object.keys(updates).forEach(key => {
      const dbColumn = fieldMappings[key] || key;
      
      if (dbColumn === 'content' && updates[key] !== undefined) {
        fields.push(`${dbColumn} = ?`);
        values.push(JSON.stringify(updates[key]));
      } else if (updates[key] !== undefined) {
        fields.push(`${dbColumn} = ?`);
        values.push(updates[key]);
      }
    });
    
    if (fields.length === 0) {
      throw new Error('No fields to update');
    }
    
    values.push(id);
    const query = `UPDATE pages SET ${fields.join(', ')} WHERE id = ?`;
    
    await pool.query(query, values);
    
    // Return updated record
    const [rows] = await pool.query('SELECT * FROM pages WHERE id = ?', [id]);
    return rows[0];
  }

  static async delete(id) {
    const [result] = await pool.query('DELETE FROM pages WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
}