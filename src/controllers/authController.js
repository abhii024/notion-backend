import { User } from '../models/User.js';
import jwt from 'jsonwebtoken';
import { asyncHandler } from '../middleware/errorHandler.js';

const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );
};

export const authController = {
  // Register new user
  register: asyncHandler(async (req, res) => {
    const { username, email, password, display_name } = req.body;
    
    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username, email, and password are required'
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters'
      });
    }
    
    const user = await User.create({
      username,
      email,
      password,
      display_name
    });
    
    // Generate token
    const token = generateToken(user.id);
    
    res.status(201).json({
      success: true,
      data: {
        user,
        token
      }
    });
  }),
  
  // Login user
  login: asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username/email and password are required'
      });
    }
    
    try {
      const user = await User.authenticate(username, password);
      const token = generateToken(user.id);
      
      res.json({
        success: true,
        data: {
          user,
          token
        }
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: error.message
      });
    }
  }),
  
  // Get current user
  getCurrentUser: asyncHandler(async (req, res) => {
    res.json({
      success: true,
      data: {
        user: req.user
      }
    });
  }),
  
  // Update profile
  updateProfile: asyncHandler(async (req, res) => {
    const updates = req.body;
    const userId = req.user.id;
    
    // Don't allow updating these fields through this endpoint
    delete updates.is_admin;
    delete updates.is_active;
    
    const updatedUser = await User.update(userId, updates);
    
    res.json({
      success: true,
      data: {
        user: updatedUser
      }
    });
  }),
  
  // Change password
  changePassword: asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required'
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters'
      });
    }
    
    // Get user with password
    const [rows] = await pool.query(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );
    const user = rows[0];
    
    // Verify current password
    const isValid = await User.comparePassword(currentPassword, user.password);
    
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }
    
    // Update password
    await User.update(userId, { password: newPassword });
    
    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  }),
  
  // Admin: Get all users
  getAllUsers: asyncHandler(async (req, res) => {
    const { limit = 100, offset = 0 } = req.query;
    
    const users = await User.findAll(parseInt(limit), parseInt(offset));
    
    res.json({
      success: true,
      count: users.length,
      data: users
    });
  }),
  
  // Admin: Update user
  adminUpdateUser: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    
    const updatedUser = await User.update(id, updates);
    
    res.json({
      success: true,
      data: {
        user: updatedUser
      }
    });
  })
};