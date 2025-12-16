import { pool } from '../config/database.js';

export class Page {
  // Generate slug from title
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

  // Get unique slug
  static async getUniqueSlug(baseSlug, userId, excludeId = null) {
    let slug = baseSlug;
    let counter = 1;
    const maxAttempts = 100;
    
    while (counter <= maxAttempts) {
      let query = 'SELECT COUNT(*) as count FROM pages WHERE slug = ?';
      const params = [slug];
      
      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      }
      
      if (excludeId) {
        query += ' AND id != ?';
        params.push(excludeId);
      }
      
      const [rows] = await pool.query(query, params);
      
      if (rows[0].count === 0) {
        return slug;
      }
      
      slug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    throw new Error(`Could not generate unique slug after ${maxAttempts} attempts`);
  }

  // Create page with slug
  static async create(pageData) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Require user_id
      if (!pageData.user_id) {
        throw new Error('user_id is required');
      }
      
      const baseSlug = this.generateSlug(pageData.title || 'Untitled');
      const uniqueSlug = await this.getUniqueSlug(baseSlug, pageData.user_id);
      
      const query = `
        INSERT INTO pages (user_id, title, slug, content, icon, cover_image, is_published)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      const values = [
        pageData.user_id,
        pageData.title || 'Untitled',
        uniqueSlug,
        JSON.stringify(pageData.content || {}),
        pageData.icon || '📄',
        pageData.cover_image || null,
        pageData.is_published !== undefined ? pageData.is_published : true
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

  // Find page by ID
  static async findById(id, userId = null) {
    let query = 'SELECT * FROM pages WHERE id = ?';
    const params = [id];
    
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    } else {
      query += ' AND is_published = TRUE';
    }
    
    const [rows] = await pool.query(query, params);
    return rows[0] || null;
  }

  // Find page by slug
  static async findBySlug(slug, userId = null) {
    let query = 'SELECT * FROM pages WHERE slug = ?';
    const params = [slug];
    
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    } else {
      query += ' AND is_published = TRUE';
    }
    
    const [rows] = await pool.query(query, params);
    return rows[0] || null;
  }

  // Get page ID from slug
  static async getIdFromSlug(slug, userId = null) {
    let query = 'SELECT id FROM pages WHERE slug = ?';
    const params = [slug];
    
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    } else {
      query += ' AND is_published = TRUE';
    }
    
    const [rows] = await pool.query(query, params);
    return rows[0] ? rows[0].id : null;
  }

  // Get all pages
  static async findAll(userId = null) {
    let query = 'SELECT * FROM pages';
    let params = [];
    
    if (userId) {
      query += ' WHERE user_id = ?';
      params.push(userId);
    } else {
      query += ' WHERE is_published = TRUE';
    }
    
    query += ' ORDER BY created_at DESC';
    const [rows] = await pool.query(query, params);
    return rows;
  }

  // Update page
  static async update(id, updates, userId = null) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Get existing page
      const existingPage = await this.findById(id, userId);
      if (!existingPage) {
        throw new Error('Page not found');
      }
      
      // Update slug if title changed
      if (updates.title && updates.title !== existingPage.title) {
        const baseSlug = this.generateSlug(updates.title);
        const uniqueSlug = await this.getUniqueSlug(baseSlug, existingPage.user_id, id);
        updates.slug = uniqueSlug;
      }
      
      // Prepare fields for update
      const fields = [];
      const values = [];
      
      const allowedFields = ['title', 'slug', 'content', 'icon', 'cover_image', 'is_published'];
      
      allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
          fields.push(`${field} = ?`);
          if (field === 'content') {
            values.push(JSON.stringify(updates[field]));
          } else {
            values.push(updates[field]);
          }
        }
      });
      
      if (fields.length === 0) {
        throw new Error('No fields to update');
      }
      
      // Add WHERE conditions
      values.push(id);
      if (userId) {
        values.push(userId);
      }
      
      const whereClause = userId ? 'WHERE id = ? AND user_id = ?' : 'WHERE id = ?';
      const query = `UPDATE pages SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP ${whereClause}`;
      
      await connection.query(query, values);
      
      const updatedPage = await this.findById(id, userId);
      
      await connection.commit();
      return updatedPage;
      
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Delete page
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

  // Search pages
  static async search(query, userId = null) {
    const searchTerm = `%${query}%`;
    let sql = 'SELECT * FROM pages WHERE (title LIKE ? OR slug LIKE ?)';
    const params = [searchTerm, searchTerm];
    
    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    } else {
      sql += ' AND is_published = TRUE';
    }
    
    sql += ' ORDER BY created_at DESC';
    const [rows] = await pool.query(sql, params);
    return rows;
  }

  // Get pages by user
  static async findByUser(userId) {
    const [rows] = await pool.query(
      'SELECT * FROM pages WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    return rows;
  }

  // Check if slug exists
  static async slugExists(slug, userId = null, excludeId = null) {
    let query = 'SELECT COUNT(*) as count FROM pages WHERE slug = ?';
    const params = [slug];
    
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    
    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }
    
    const [rows] = await pool.query(query, params);
    return rows[0].count > 0;
  }
}