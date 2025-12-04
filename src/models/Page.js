import { pool } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

export class Page {
  static async create({ title, content = {}, parent_id = null, icon = '📄', cover_image = null }) {
    const id = uuidv4();
    const query = `
      INSERT INTO pages (id, title, content, parent_id, icon, cover_image)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const values = [id, title, content, parent_id, icon, cover_image];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async findAll(includeUnpublished = false) {
    let query = 'SELECT * FROM pages';
    if (!includeUnpublished) {
      query += ' WHERE is_published = true';
    }
    query += ' ORDER BY created_at DESC';
    
    const result = await pool.query(query);
    return result.rows;
  }

  static async findById(id, includeUnpublished = false) {
    let query = 'SELECT * FROM pages WHERE id = $1';
    const values = [id];
    
    if (!includeUnpublished) {
      query += ' AND is_published = true';
    }
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async update(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    const allowedFields = ['title', 'content', 'parent_id', 'icon', 'cover_image', 'is_published'];
    
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
      UPDATE pages 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async delete(id) {
    const query = 'DELETE FROM pages WHERE id = $1 RETURNING id';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  static async findChildren(parentId) {
    const query = `
      SELECT * FROM pages 
      WHERE parent_id = $1 AND is_published = true
      ORDER BY created_at
    `;
    const result = await pool.query(query, [parentId]);
    return result.rows;
  }

  static async search(queryText) {
    const query = `
      SELECT * FROM pages 
      WHERE is_published = true 
      AND (title ILIKE $1 OR content::text ILIKE $1)
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query, [`%${queryText}%`]);
    return result.rows;
  }

  static async updateTimestamp(id) {
    const query = `
      UPDATE pages 
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, updated_at
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }
}