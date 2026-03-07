// src/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const { sendOTP, verifyOTP, setMPIN, loginWithMPIN, verifyToken, logout } = require('../controllers/auth.controller');
const { directLoginMPIN, checkSubscription } = require('../controllers/auth.direct');

router.post('/send-otp', sendOTP);
router.post('/verify-otp', verifyOTP);
router.post('/set-mpin', setMPIN);
router.post('/login', loginWithMPIN);

// Direct mobile + MPIN login (no OTP step)
router.post('/login-mpin', directLoginMPIN);
router.get('/subscription', authMiddleware, checkSubscription);

router.get('/verify', authMiddleware, verifyToken);
router.post('/logout', authMiddleware, logout);

module.exports = router;
