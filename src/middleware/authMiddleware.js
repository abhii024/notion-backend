import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';

export const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication token required'
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // Get user from database
    const [users] = await pool.query(
      'SELECT id, username, email, display_name, avatar_url, is_active, is_admin FROM users WHERE id = ?',
      [decoded.userId]
    );
    
    if (!users.length) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }
    
    if (!users[0].is_active) {
      return res.status(401).json({
        success: false,
        error: 'Account is deactivated'
      });
    }
    
    // Attach user to request
    req.user = users[0];
    next();
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired'
      });
    }
    
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

// Optional: Admin middleware
export const adminMiddleware = (req, res, next) => {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
  next();
};