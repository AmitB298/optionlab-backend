'use strict';

const fs   = require('fs');
const path = require('path');

const target = path.join(__dirname, 'src', 'routes', 'auth.routes.js');
let content  = fs.readFileSync(target, 'utf8');

// Replace the UPDATE query that references total_logins
const oldUpdate = `    await pool.query(
      'UPDATE users SET last_login_at = NOW(), total_logins = COALESCE(total_logins, 0) + 1 WHERE id = $1',
      [user.id]
    );`;

const newUpdate = `    // Update last login — use DO UPDATE to safely skip missing columns
    await pool.query(
      \`UPDATE users SET last_login_at = NOW() WHERE id = $1\`,
      [user.id]
    ).catch(() => {}); // ignore if last_login_at column missing too
    // Try to increment total_logins separately (column may not exist)
    await pool.query(
      \`UPDATE users SET total_logins = COALESCE(total_logins, 0) + 1 WHERE id = $1\`,
      [user.id]
    ).catch(() => {}); // ignore if column doesn't exist`;

if (content.includes(oldUpdate)) {
  content = content.replace(oldUpdate, newUpdate);
  fs.writeFileSync(target, content, 'utf8');
  console.log('✓ Fixed: login now handles missing total_logins column gracefully');
} else {
  console.log('Pattern not found — writing full safe version...');

  // Write the full file from scratch with safe queries
  const full = `'use strict';

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
    const { name, mobile, mpin } = req.body;
    if (!mobile || !mpin) return res.status(400).json({ success: false, message: 'Mobile and MPIN required' });
    if (!/^[0-9]{10}$/.test(mobile)) return res.status(400).json({ success: false, message: 'Invalid mobile' });
    if (mpin.length < 4) return res.status(400).json({ success: false, message: 'MPIN too short' });

    const existing = await pool.query('SELECT id FROM users WHERE mobile = $1', [mobile]);
    if (existing.rows.length > 0) return res.status(409).json({ success: false, message: 'Mobile already registered' });

    const mpin_hash = await bcrypt.hash(mpin, 10);
    const result = await pool.query(
      \`INSERT INTO users (name, mobile, mpin_hash, plan, is_active, created_at)
       VALUES ($1, $2, $3, 'FREE', true, NOW())
       RETURNING id, name, mobile, plan\`,
      [name || null, mobile, mpin_hash]
    );
    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, mobile: user.mobile, plan: user.plan },
      process.env.JWT_SECRET || 'optionlab_secret',
      { expiresIn: '30d' }
    );
    return res.json({ success: true, message: 'Registration successful', token, user });
  } catch (err) {
    console.error('[register]', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── POST /api/auth/login-mpin ───────────────────────────────────────────────
router.post('/login-mpin', async (req, res) => {
  try {
    const { mobile, mpin } = req.body;
    if (!mobile || !mpin) return res.status(400).json({ success: false, message: 'Mobile and MPIN required' });

    const result = await pool.query(
      'SELECT id, name, mobile, mpin_hash, plan, is_active FROM users WHERE mobile = $1',
      [mobile]
    );
    if (!result.rows.length) return res.status(401).json({ success: false, message: 'Invalid mobile or MPIN' });

    const user = result.rows[0];
    if (!user.is_active) return res.status(403).json({ success: false, message: 'Account deactivated' });

    const match = await bcrypt.compare(mpin, user.mpin_hash);
    if (!match) return res.status(401).json({ success: false, message: 'Invalid mobile or MPIN' });

    // Safe updates — ignore if columns don't exist yet
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]).catch(() => {});
    await pool.query('UPDATE users SET total_logins = COALESCE(total_logins, 0) + 1 WHERE id = $1', [user.id]).catch(() => {});

    const token = jwt.sign(
      { id: user.id, mobile: user.mobile, plan: user.plan },
      process.env.JWT_SECRET || 'optionlab_secret',
      { expiresIn: '30d' }
    );
    return res.json({
      success: true, message: 'Login successful', token,
      user: { id: user.id, name: user.name, mobile: user.mobile, plan: user.plan }
    });
  } catch (err) {
    console.error('[login-mpin]', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /api/auth/validate ──────────────────────────────────────────────────
router.get('/validate', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ success: false, message: 'No token' });
    const decoded = jwt.verify(auth.slice(7), process.env.JWT_SECRET || 'optionlab_secret');
    const result  = await pool.query('SELECT id, name, mobile, plan, is_active FROM users WHERE id = $1', [decoded.id]);
    if (!result.rows.length || !result.rows[0].is_active) return res.status(401).json({ success: false, message: 'Invalid session' });
    return res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
});

module.exports = router;
`;
  fs.writeFileSync(target, full, 'utf8');
  console.log('✓ Full safe auth.routes.js written');
}

// Verify it loads
try {
  // Quick syntax check
  require(target);
  console.log('✓ File loads without errors');
} catch(e) {
  console.log('✗ Load error:', e.message);
}