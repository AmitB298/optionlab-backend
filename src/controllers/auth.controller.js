// src/controllers/auth.controller.js
const pool = require('../db/pool');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const crypto = require('crypto');

// ─── Send OTP via Fast2SMS ─────────────────────────────────────────────────────
async function sendOTP(req, res) {
  const { mobile } = req.body;

  if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
    return res.status(400).json({ success: false, message: 'Invalid mobile number' });
  }

  try {
    // Check if user exists and is active
    const userResult = await pool.query('SELECT id, is_active FROM users WHERE mobile = $1', [mobile]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Mobile number not registered. Please contact admin.' });
    }

    if (!userResult.rows[0].is_active) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Please contact admin.' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Invalidate old OTPs for this mobile
    await pool.query('UPDATE otps SET is_used = true WHERE mobile = $1 AND is_used = false', [mobile]);

    // Store new OTP
    await pool.query(
      'INSERT INTO otps (mobile, otp_hash, expires_at) VALUES ($1, $2, $3)',
      [mobile, await bcrypt.hash(otp, 10), expiresAt]
    );

    // Send via Fast2SMS
    if (process.env.NODE_ENV === 'production') {
      await axios.get('https://www.fast2sms.com/dev/bulkV2', {
        params: {
          authorization: process.env.FAST2SMS_API_KEY,
          variables_values: otp,
          route: 'otp',
          numbers: mobile,
        }
      });
    } else {
      // Dev mode — log OTP to console
      console.log(`[DEV] OTP for ${mobile}: ${otp}`);
    }

    res.json({ success: true, message: 'OTP sent successfully' });

  } catch (err) {
    console.error('sendOTP error:', err);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
}

// ─── Verify OTP ───────────────────────────────────────────────────────────────
async function verifyOTP(req, res) {
  const { mobile, otp } = req.body;

  if (!mobile || !otp) {
    return res.status(400).json({ success: false, message: 'Mobile and OTP are required' });
  }

  try {
    const otpResult = await pool.query(
      'SELECT * FROM otps WHERE mobile = $1 AND is_used = false AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [mobile]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'OTP expired or not found. Please request a new OTP.' });
    }

    const validOTP = await bcrypt.compare(otp, otpResult.rows[0].otp_hash);
    if (!validOTP) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    // Mark OTP as used
    await pool.query('UPDATE otps SET is_used = true WHERE id = $1', [otpResult.rows[0].id]);

    // Check if user has MPIN set
    const userResult = await pool.query('SELECT id, mpin_hash, name FROM users WHERE mobile = $1', [mobile]);
    const hasMpin = !!userResult.rows[0].mpin_hash;

    // Generate a short-lived session token for MPIN step
    const sessionToken = jwt.sign(
      { mobile, step: 'mpin_required', userId: userResult.rows[0].id },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    res.json({
      success: true,
      hasMpin,
      sessionToken,
      message: hasMpin ? 'OTP verified. Enter your MPIN.' : 'OTP verified. Set your 6-digit MPIN.'
    });

  } catch (err) {
    console.error('verifyOTP error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ─── Set MPIN (first time) ────────────────────────────────────────────────────
async function setMPIN(req, res) {
  const { sessionToken, mpin } = req.body;

  if (!mpin || !/^\d{6}$/.test(mpin)) {
    return res.status(400).json({ success: false, message: 'MPIN must be exactly 6 digits' });
  }

  try {
    const decoded = jwt.verify(sessionToken, process.env.JWT_SECRET);
    if (decoded.step !== 'mpin_required') {
      return res.status(400).json({ success: false, message: 'Invalid session' });
    }

    const mpinHash = await bcrypt.hash(mpin, 12);
    await pool.query('UPDATE users SET mpin_hash = $1 WHERE mobile = $2', [mpinHash, decoded.mobile]);

    res.json({ success: true, message: 'MPIN set successfully. Please login.' });

  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired. Please restart login.' });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ─── Login with MPIN ──────────────────────────────────────────────────────────
async function loginWithMPIN(req, res) {
  const { sessionToken, mpin, deviceId } = req.body;

  if (!mpin || !/^\d{6}$/.test(mpin)) {
    return res.status(400).json({ success: false, message: 'Invalid MPIN format' });
  }

  try {
    const decoded = jwt.verify(sessionToken, process.env.JWT_SECRET);

    const userResult = await pool.query(
      `SELECT u.*, up.plan_type, up.end_date, up.is_active as plan_active
       FROM users u
       LEFT JOIN user_plans up ON up.user_id = u.id AND up.is_active = true AND up.end_date > NOW()
       ORDER BY up.end_date DESC NULLS LAST
       LIMIT 1`,
      // Note: using a subquery pattern below instead
    );

    // Proper query
    const user = await pool.query(
      `SELECT u.id, u.mobile, u.name, u.email, u.mpin_hash, u.is_active,
              up.plan_type, up.end_date
       FROM users u
       LEFT JOIN user_plans up ON up.user_id = u.id AND up.is_active = true AND up.end_date > NOW()
       WHERE u.mobile = $1
       ORDER BY up.end_date DESC NULLS LAST
       LIMIT 1`,
      [decoded.mobile]
    );

    if (user.rows.length === 0 || !user.rows[0].is_active) {
      return res.status(403).json({ success: false, message: 'Account not found or deactivated' });
    }

    const validMpin = await bcrypt.compare(mpin, user.rows[0].mpin_hash);
    if (!validMpin) {
      return res.status(401).json({ success: false, message: 'Incorrect MPIN' });
    }

    const u = user.rows[0];

    // Determine plan status
    let planStatus = 'expired';
    let planType = null;
    if (u.plan_type && u.end_date && new Date(u.end_date) > new Date()) {
      planStatus = 'active';
      planType = u.plan_type;
    }

    // ─── Single Device Enforcement ─────────────────────────────────────────────
    const finalDeviceId = deviceId || `device_${crypto.randomBytes(8).toString('hex')}`;

    // Invalidate all existing sessions for this user
    await pool.query('UPDATE sessions SET is_active = false WHERE user_id = $1', [u.id]);

    // Create new session
    await pool.query(
      'INSERT INTO sessions (user_id, device_id, ip_address) VALUES ($1, $2, $3)',
      [u.id, finalDeviceId, req.ip]
    );

    // Issue JWT
    const token = jwt.sign(
      { userId: u.id, mobile: u.mobile, deviceId: finalDeviceId, planStatus, planType },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const refreshToken = jwt.sign(
      { userId: u.id, type: 'refresh' },
      process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: u.id,
        name: u.name,
        mobile: u.mobile,
        email: u.email,
        planStatus,
        planType,
        planExpiry: u.end_date,
      },
      deviceId: finalDeviceId,
    });

  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired. Please restart login.' });
    }
    console.error('loginWithMPIN error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ─── Verify Token (for auto-login check) ─────────────────────────────────────
async function verifyToken(req, res) {
  // Token already validated by middleware
  const { userId, deviceId } = req.user;

  try {
    // Check session is still valid (device check)
    const session = await pool.query(
      'SELECT * FROM sessions WHERE user_id = $1 AND device_id = $2 AND is_active = true',
      [userId, deviceId]
    );

    if (session.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Session invalidated. Please login again.' });
    }

    // Get fresh user + plan data
    const user = await pool.query(
      `SELECT u.id, u.mobile, u.name, u.email,
              up.plan_type, up.end_date
       FROM users u
       LEFT JOIN user_plans up ON up.user_id = u.id AND up.is_active = true AND up.end_date > NOW()
       WHERE u.id = $1 AND u.is_active = true
       ORDER BY up.end_date DESC NULLS LAST
       LIMIT 1`,
      [userId]
    );

    if (user.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found or deactivated' });
    }

    const u = user.rows[0];
    const planStatus = (u.plan_type && u.end_date && new Date(u.end_date) > new Date()) ? 'active' : 'expired';

    res.json({
      success: true,
      user: {
        id: u.id,
        name: u.name,
        mobile: u.mobile,
        email: u.email,
        planStatus,
        planType: u.plan_type,
        planExpiry: u.end_date,
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
async function logout(req, res) {
  const { userId, deviceId } = req.user;
  try {
    await pool.query(
      'UPDATE sessions SET is_active = false, ended_at = NOW() WHERE user_id = $1 AND device_id = $2',
      [userId, deviceId]
    );
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = { sendOTP, verifyOTP, setMPIN, loginWithMPIN, verifyToken, logout };
