import { pool } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

export class Page {
  static async create(pageData) {
    const id = pageData.id || crypto.randomUUID();
    
    const query = `
      INSERT INTO pages (id, title, content, parent_id, icon, cover_image)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const values = [
      id,
      pageData.title || 'Untitled',
      JSON.stringify(pageData.content || {}),
      pageData.parent_id || null,
      pageData.icon || '📄',
      pageData.cover_image || null
    ];

    const [result] = await pool.query(query, values);
    
    // Get the inserted record
    const [rows] = await pool.query('SELECT * FROM pages WHERE id = ?', [id]);
    return rows[0];
  }

  static async findById(id) {
    const [rows] = await pool.query('SELECT * FROM pages WHERE id = ?', [id]);
    return rows[0];
  }

  static async findAll(parentId = null) {
    let query = 'SELECT * FROM pages';
    let params = [];
    // console.log("parentId",parentId)
    // if (parentId === null) {
    //   query += ' WHERE parent_id IS NULL';
    // } else if (parentId !== undefined) {
    //   query += ' WHERE parent_id = ?';
    //   params.push(parentId);
    // }
    
    query += ' ORDER BY created_at DESC';
    const [rows] = await pool.query(query, params);
    console.log("rows",rows)
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