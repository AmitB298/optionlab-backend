const express = require('express');
const router = express.Router();
const { adminMiddleware } = require('../middleware/auth.middleware');
const { adminLogin, getDashboardStats, getAllUsers, addUser, assignPlan, toggleUserStatus, toggleFlagged, setupAdmin, getUserHistory } = require('../controllers/admin.controller');

router.post('/setup', setupAdmin);
router.post('/login', adminLogin);
router.get('/dashboard', adminMiddleware, getDashboardStats);
router.get('/users', adminMiddleware, getAllUsers);
router.post('/users', adminMiddleware, addUser);
router.post('/users/:userId/plan', adminMiddleware, assignPlan);
router.patch('/users/:userId/status', adminMiddleware, toggleUserStatus);
router.patch('/users/:userId/flag', adminMiddleware, toggleFlagged);
router.get('/users/:userId/history', adminMiddleware, getUserHistory);

module.exports = router;
