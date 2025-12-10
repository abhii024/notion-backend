import { pool } from '../config/database.js';

export class Page {
  // Helper function to generate slug from title
  static generateSlug(title) {
    if (!title) return 'untitled';
    
    // Convert to lowercase, replace spaces with hyphens, remove special chars
    let baseSlug = title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-')     // Replace spaces with hyphens
      .replace(/--+/g, '-')     // Replace multiple hyphens with single
      .trim();
    
    // If slug becomes empty after cleaning, use 'untitled'
    if (!baseSlug) baseSlug = 'untitled';
    
    return baseSlug;
  }

  // Helper function to get unique slug
  static async getUniqueSlug(baseSlug, parentId = null, excludeId = null) {
    let slug = baseSlug;
    let counter = 1;
    const maxAttempts = 100; // Prevent infinite loop
    
    while (counter <= maxAttempts) {
      let query = 'SELECT COUNT(*) as count FROM pages WHERE slug = ?';
      const params = [slug];
      
      if (excludeId) {
        query += ' AND id != ?';
        params.push(excludeId);
      }
      
      // Don't filter by parent_id when checking slug uniqueness
      // Slugs should be globally unique in the system
      
      const [rows] = await pool.query(query, params);
      
      if (rows[0].count === 0) {
        return slug;
      }
      
      // If slug exists, try with suffix
      if (counter === 1) {
        slug = `${baseSlug}-${counter + 1}`;
      } else {
        // For hello-sir-2, we need to remove the existing suffix first
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
      
      // Generate slug from title
      const baseSlug = this.generateSlug(pageData.title || 'Untitled');
      console.log(`Base slug generated: ${baseSlug}`);
      
      // Get unique slug (globally unique, not just within parent)
      const uniqueSlug = await this.getUniqueSlug(baseSlug, null, null);
      console.log(`Unique slug determined: ${uniqueSlug}`);
      
      const query = `
        INSERT INTO pages (title, slug, content, parent_id, icon, cover_image)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      const values = [
        pageData.title || 'Untitled',
        uniqueSlug,
        JSON.stringify(pageData.content || {}),
        pageData.parent_id || null,
        pageData.icon || '📄',
        pageData.cover_image || null
      ];

      console.log('Inserting page with values:', values);
      const [result] = await connection.query(query, values);
      const newId = result.insertId; 
      
      await connection.commit();
      
      console.log(`Page created successfully with ID: ${newId}, Slug: ${uniqueSlug}`);
      return await this.findById(newId);
      
    } catch (error) {
      await connection.rollback();
      console.error('Error creating page:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  static async createAlternative(pageData) {
    const query = `
      INSERT INTO pages (title, slug, content, parent_id, icon, cover_image)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const values = [
      pageData.title || 'Untitled',
      pageData.slug || this.generateSlug(pageData.title || 'Untitled'),
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
      
      // Generate slug from title
      const baseSlug = this.generateSlug(pageData.title || 'Untitled');
      const uniqueSlug = await this.getUniqueSlug(baseSlug, null, null);
      
      const query = `
        INSERT INTO pages (id, title, slug, content, parent_id, icon, cover_image)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      const values = [
        newId,
        pageData.title || 'Untitled',
        uniqueSlug,
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

  static async findBySlug(slug) {
    const [rows] = await pool.query('SELECT * FROM pages WHERE slug = ?', [slug]);
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
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Check if title is being updated
      if (updates.title) {
        const existingPage = await this.findById(id);
        
        // Generate new slug from title
        const baseSlug = this.generateSlug(updates.title);
        const uniqueSlug = await this.getUniqueSlug(baseSlug, null, id);
        
        updates.slug = uniqueSlug;
      }
      
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
      
      await connection.query(query, values);
      
      // Return updated record
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

  static async delete(id) {
    const [result] = await pool.query('DELETE FROM pages WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  // Search pages by slug or title
  static async search(query) {
    const searchTerm = `%${query}%`;
    const [rows] = await pool.query(
      'SELECT * FROM pages WHERE title LIKE ? OR slug LIKE ? ORDER BY created_at DESC',
      [searchTerm, searchTerm]
    );
    return rows;
  }

  // Find children of a parent page
  static async findChildren(parentId) {
    if (parentId === null || parentId === undefined) {
      const [rows] = await pool.query(
        'SELECT * FROM pages WHERE parent_id IS NULL ORDER BY created_at DESC'
      );
      return rows;
    }
    
    const [rows] = await pool.query(
      'SELECT * FROM pages WHERE parent_id = ? ORDER BY created_at DESC',
      [parentId]
    );
    return rows;
  }
  
  // Check if slug exists (for debugging)
  static async slugExists(slug, excludeId = null) {
    let query = 'SELECT COUNT(*) as count FROM pages WHERE slug = ?';
    const params = [slug];
    
    if (excludeId) {
      query += ' AND id != ?';
      params.push(excludeId);
    }
    
    const [rows] = await pool.query(query, params);
    return rows[0].count > 0;
  }
}