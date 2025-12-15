import { pool } from '../config/database.js';

export class Page {
  static generateSlug(title) {
    if (!title) return 'untitled';
    
    let baseSlug = title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-')
      .trim();
    
    if (!baseSlug) baseSlug = 'untitled';
    return baseSlug;
  }

  static async getUniqueSlug(baseSlug, userId, excludeId = null) {
    let slug = baseSlug;
    let counter = 1;
    const maxAttempts = 100;
    
    while (counter <= maxAttempts) {
      let query = 'SELECT COUNT(*) as count FROM pages WHERE slug = ? AND user_id = ?';
      const params = [slug, userId];
      
      if (excludeId) {
        query += ' AND id != ?';
        params.push(excludeId);
      }
      
      const [rows] = await pool.query(query, params);
      
      if (rows[0].count === 0) {
        return slug;
      }
      
      if (counter === 1) {
        slug = `${baseSlug}-${counter + 1}`;
      } else {
        const matches = slug.match(/^(.+)-(\d+)$/);
        if (matches) {
          slug = `${matches[1]}-${parseInt(matches[2]) + 1}`;
        } else {
          slug = `${baseSlug}-${counter + 1}`;
        }
      }
      counter++;
    }
    
    throw new Error(`Could not generate unique slug after ${maxAttempts} attempts`);
  }

  static async create(pageData) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Require user_id
      if (!pageData.user_id) {
        throw new Error('user_id is required');
      }
      
      const baseSlug = this.generateSlug(pageData.title || 'Untitled');
      const uniqueSlug = await this.getUniqueSlug(baseSlug, pageData.user_id, null);
      
      const query = `
        INSERT INTO pages (user_id, title, slug, content, icon, cover_image)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      const values = [
        pageData.user_id,
        pageData.title || 'Untitled',
        uniqueSlug,
        JSON.stringify(pageData.content || {}),
        pageData.icon || '📄',
        pageData.cover_image || null
      ];

      const [result] = await connection.query(query, values);
      const newId = result.insertId;
      
      await connection.commit();
      
      return await this.findById(newId);
      
    } catch (error) {
      await connection.rollback();
      console.error('Error creating page:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  static async findById(id) {
    const [rows] = await pool.query('SELECT * FROM pages WHERE id = ?', [id]);
    return rows[0];
  }

  static async findBySlug(slug, userId = null) {
    let query = 'SELECT * FROM pages WHERE slug = ?';
    const params = [slug];
    
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    
    const [rows] = await pool.query(query, params);
    return rows[0];
  }

  static async findAll(userId = null) {
    let query = 'SELECT * FROM pages';
    let params = [];
    
    if (userId) {
      query += ' WHERE user_id = ?';
      params.push(userId);
    }
    
    query += ' ORDER BY created_at DESC';
    const [rows] = await pool.query(query, params);
    return rows;
  }

  static async update(id, updates) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Get existing page to check user_id
      const existingPage = await this.findById(id);
      if (!existingPage) {
        throw new Error('Page not found');
      }
      
      // Check if title is being updated
      if (updates.title) {
        const baseSlug = this.generateSlug(updates.title);
        const uniqueSlug = await this.getUniqueSlug(baseSlug, existingPage.user_id, id);
        updates.slug = uniqueSlug;
      }
      
      const fieldMappings = {
        coverImage: 'cover_image'
      };
      
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
      
      await connection.query(query, values);
      
      const [rows] = await connection.query('SELECT * FROM pages WHERE id = ?', [id]);
      
      await connection.commit();
      return rows[0];
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async delete(id, userId = null) {
    let query = 'DELETE FROM pages WHERE id = ?';
    const params = [id];
    
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    
    const [result] = await pool.query(query, params);
    return result.affectedRows > 0;
  }

  static async search(query, userId = null) {
    const searchTerm = `%${query}%`;
    let sql = 'SELECT * FROM pages WHERE (title LIKE ? OR slug LIKE ?)';
    const params = [searchTerm, searchTerm];
    
    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }
    
    sql += ' ORDER BY created_at DESC';
    const [rows] = await pool.query(sql, params);
    return rows;
  }

  static async slugExists(slug, userId, excludeId = null) {
    let query = 'SELECT COUNT(*) as count FROM pages WHERE slug = ? AND user_id = ?';
    const params = [slug, userId];
    
    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }
    
    const [rows] = await pool.query(query, params);
    return rows[0].count > 0;
  }

  // Get pages by user
  static async findByUser(userId) {
    const [rows] = await pool.query(
      'SELECT * FROM pages WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  }
}