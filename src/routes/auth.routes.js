'use strict';

const express  = require('express');
const router   = express.Router();
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── POST /api/auth/register ─────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, mobile, mpin, clientId } = req.body;

    if (!mobile || !mpin) {
      return res.status(400).json({ success: false, message: 'Mobile and MPIN are required' });
    }
    if (!/^[0-9]{10}$/.test(mobile)) {
      return res.status(400).json({ success: false, message: 'Invalid mobile number' });
    }
    if (mpin.length < 4) {
      return res.status(400).json({ success: false, message: 'MPIN must be at least 4 digits' });
    }

    // Check if mobile already registered
    const existing = await pool.query('SELECT id FROM users WHERE mobile = $1', [mobile]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Mobile number already registered' });
    }

    const mpin_hash = await bcrypt.hash(mpin, 10);

    const result = await pool.query(
      `INSERT INTO users (name, mobile, mpin_hash, plan, is_active, created_at)
       VALUES ($1, $2, $3, 'FREE', true, NOW())
       RETURNING id, name, mobile, plan, is_active, created_at`,
      [name || null, mobile, mpin_hash]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, mobile: user.mobile, plan: user.plan },
      process.env.JWT_SECRET || 'optionlab_secret',
      { expiresIn: '30d' }
    );

    return res.json({
      success: true,
      message: 'Registration successful',
      token,
      user: { id: user.id, name: user.name, mobile: user.mobile, plan: user.plan }
    });

  } catch (err) {
    console.error('[register]', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── POST /api/auth/login-mpin ───────────────────────────────────────────────
router.post('/login-mpin', async (req, res) => {
  try {
    const { mobile, mpin } = req.body;

    if (!mobile || !mpin) {
      return res.status(400).json({ success: false, message: 'Mobile and MPIN are required' });
    }

    const result = await pool.query(
      'SELECT id, name, mobile, mpin_hash, plan, is_active FROM users WHERE mobile = $1',
      [mobile]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid mobile or MPIN' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    const match = await bcrypt.compare(mpin, user.mpin_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid mobile or MPIN' });
    }

    // Update last login
    // Update last login — use DO UPDATE to safely skip missing columns
    await pool.query(
      `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
      [user.id]
    ).catch(() => {}); // ignore if last_login_at column missing too
    // Try to increment total_logins separately (column may not exist)
    await pool.query(
      `UPDATE users SET total_logins = COALESCE(total_logins, 0) + 1 WHERE id = $1`,
      [user.id]
    ).catch(() => {}); // ignore if column doesn't exist

    const token = jwt.sign(
      { id: user.id, mobile: user.mobile, plan: user.plan },
      process.env.JWT_SECRET || 'optionlab_secret',
      { expiresIn: '30d' }
    );

    return res.json({
      success: true,
      message: 'Login successful',
      token,
      user: { id: user.id, name: user.name, mobile: user.mobile, plan: user.plan }
    });

  } catch (err) {
    console.error('[login-mpin]', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── POST /api/auth/login (legacy MPIN login) ────────────────────────────────
router.post('/login', async (req, res) => {
  return res.redirect(307, '/api/auth/login-mpin');
});

// ─── GET /api/auth/validate ──────────────────────────────────────────────────
router.get('/validate', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token' });
    }
    const token = auth.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'optionlab_secret');

    const result = await pool.query(
      'SELECT id, name, mobile, plan, is_active FROM users WHERE id = $1',
      [decoded.id]
    );
    if (!result.rows.length || !result.rows[0].is_active) {
      return res.status(401).json({ success: false, message: 'Invalid session' });
    }

    return res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
});


// ─── GET /api/auth/subscription ──────────────────────────────────────────────
router.get('/subscription', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token' });
    }
    let decoded;
    try { decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET || 'optionlab_secret'); }
    catch { return res.status(401).json({ success: false, message: 'Invalid token' }); }

    const result = await pool.query(
      `SELECT id, name, mobile, plan, is_active, plan_expires_at, trial_started_at, created_at FROM users WHERE id = $1`,
      [decoded.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'User not found' });

    const user = result.rows[0];
    if (!user.is_active) return res.json({ success: true, status: 'expired', plan: user.plan, daysRemaining: 0 });

    const now = new Date();
    let status = 'active', daysRemaining = 36500, endDate = null;

    if (user.plan === 'SUSPENDED') {
      status = 'expired'; daysRemaining = 0;
    } else if (user.plan === 'TRIAL') {
      const trialEnd = new Date(user.trial_started_at || user.created_at);
      trialEnd.setDate(trialEnd.getDate() + 14);
      endDate = trialEnd.toISOString();
      if (now > trialEnd) { status = 'expired'; daysRemaining = 0; }
      else { status = 'active'; daysRemaining = Math.ceil((trialEnd - now) / 86400000); }
    } else if (user.plan === 'PAID' && user.plan_expires_at) {
      const expiry = new Date(user.plan_expires_at);
      endDate = expiry.toISOString();
      if (now > expiry) { status = 'expired'; daysRemaining = 0; }
      else { status = 'active'; daysRemaining = Math.ceil((expiry - now) / 86400000); }
    }

    return res.json({
      success: true, status, plan: user.plan, daysRemaining, endDate,
      user: { id: user.id, name: user.name, mobile: user.mobile, plan: user.plan, subscriptionStatus: status, daysRemaining }
    });
  } catch (err) {
    console.error('[subscription]', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});
module.exports = router;
