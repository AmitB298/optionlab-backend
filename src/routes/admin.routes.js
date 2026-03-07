// src/routes/admin.routes.js
const express = require('express');
const router = express.Router();
const { adminMiddleware } = require('../middleware/auth.middleware');
const {
  adminLogin,
  getDashboardStats,
  getAllUsers,
  addUser,
  assignPlan,
  toggleUserStatus,
  setupAdmin,
  getUserHistory,
} = require('../controllers/admin.controller');

// One-time setup
router.post('/setup', setupAdmin);

// Admin auth
router.post('/login', adminLogin);

// Protected admin routes
router.get('/dashboard', adminMiddleware, getDashboardStats);
router.get('/users', adminMiddleware, getAllUsers);
router.post('/users', adminMiddleware, addUser);
router.post('/users/:userId/plan', adminMiddleware, assignPlan);
router.patch('/users/:userId/status', adminMiddleware, toggleUserStatus);
router.get('/users/:userId/history', adminMiddleware, getUserHistory);

module.exports = router;
