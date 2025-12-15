import express from 'express';
import { authController } from '../controllers/authController.js';
import { authenticate, isAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Public routes
router.post('/register', asyncHandler(authController.register));
router.post('/login', asyncHandler(authController.login));

// Protected routes
router.get('/me', authenticate, asyncHandler(authController.getCurrentUser));
router.put('/profile', authenticate, asyncHandler(authController.updateProfile));
router.put('/change-password', authenticate, asyncHandler(authController.changePassword));

// Admin routes
router.get('/users', authenticate, isAdmin, asyncHandler(authController.getAllUsers));
router.put('/users/:id', authenticate, isAdmin, asyncHandler(authController.adminUpdateUser));

export default router;