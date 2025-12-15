import { pool } from '../config/database.js';
import bcrypt from 'bcrypt';

export class User {
  // Hash password
  static async hashPassword(password) {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
  }

  // Compare password
  static async comparePassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }

  // Create new user
  static async create(userData) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // Hash password
      const hashedPassword = await this.hashPassword(userData.password);
      
      const query = `
        INSERT INTO users 
        (username, email, password, display_name, avatar_url)
        VALUES (?, ?, ?, ?, ?)
      `;
      
      const values = [
        userData.username,
        userData.email,
        hashedPassword,
        userData.display_name || userData.username,
        userData.avatar_url || null
      ];
      
      const [result] = await connection.query(query, values);
      const newId = result.insertId;
      
      // Get created user (without password)
      const [rows] = await connection.query(
        'SELECT id, username, email, display_name, avatar_url, is_active, is_admin, created_at FROM users WHERE id = ?',
        [newId]
      );
      
      await connection.commit();
      return rows[0];
      
    } catch (error) {
      await connection.rollback();
      
      // Handle duplicate errors
      if (error.code === 'ER_DUP_ENTRY') {
        if (error.message.includes('username')) {
          throw new Error('Username already exists');
        } else if (error.message.includes('email')) {
          throw new Error('Email already exists');
        }
      }
      
      throw error;
    } finally {
      connection.release();
    }
  }

  // Find user by ID
  static async findById(id) {
    const [rows] = await pool.query(
      'SELECT id, username, email, display_name, avatar_url, is_active, is_admin, last_login, created_at FROM users WHERE id = ?',
      [id]
    );
    return rows[0];
  }

  // Find user by username
  static async findByUsername(username) {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    return rows[0];
  }

  // Find user by email
  static async findByEmail(email) {
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    return rows[0];
  }

  // Update user
  static async update(id, updates) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // If password is being updated, hash it
      if (updates.password) {
        updates.password = await this.hashPassword(updates.password);
      }
      
      // Build dynamic update query
      const fields = [];
      const values = [];
      
      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(updates[key]);
        }
      });
      
      if (fields.length === 0) {
        throw new Error('No fields to update');
      }
      
      values.push(id);
      const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
      
      await connection.query(query, values);
      
      // Return updated user (without password)
      const [rows] = await connection.query(
        'SELECT id, username, email, display_name, avatar_url, is_active, is_admin, last_login, created_at FROM users WHERE id = ?',
        [id]
      );
      
      await connection.commit();
      return rows[0];
      
    } catch (error) {
      await connection.rollback();
      
      // Handle duplicate errors
      if (error.code === 'ER_DUP_ENTRY') {
        if (error.message.includes('username')) {
          throw new Error('Username already exists');
        } else if (error.message.includes('email')) {
          throw new Error('Email already exists');
        }
      }
      
      throw error;
    } finally {
      connection.release();
    }
  }

  // Update last login time
  static async updateLastLogin(id) {
    await pool.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );
  }

  // Authenticate user (login)
  static async authenticate(usernameOrEmail, password) {
    // Try to find user by username or email
    let user = await this.findByUsername(usernameOrEmail);
    
    if (!user) {
      user = await this.findByEmail(usernameOrEmail);
    }
    
    if (!user) {
      throw new Error('User not found');
    }
    
    if (!user.is_active) {
      throw new Error('Account is deactivated');
    }
    
    // Compare passwords
    const isValid = await this.comparePassword(password, user.password);
    
    if (!isValid) {
      throw new Error('Invalid password');
    }
    
    // Update last login
    await this.updateLastLogin(user.id);
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // Delete user
  static async delete(id) {
    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  // Get all users (for admin)
  static async findAll(limit = 100, offset = 0) {
    const [rows] = await pool.query(
      'SELECT id, username, email, display_name, avatar_url, is_active, is_admin, last_login, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    return rows;
  }
}