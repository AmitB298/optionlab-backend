// src/routes/auth.routes.js
const router = require('express').Router();
const { register, loginMpin, changeMpin, updateProfile } = require('../controllers/auth.direct');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET || 'optionlab-secret-key';

router.post('/register',        register);
router.post('/login-mpin',      loginMpin);
router.post('/change-mpin',     changeMpin);
router.patch('/update-profile', updateProfile);

// GET /api/auth/subscription — returns subscription status for the logged-in user
router.get('/subscription', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, status: 'expired' });

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, status: 'expired' });
    }

    const result = await pool.query(
      'SELECT id, mobile, plan, is_active FROM users WHERE id = $1',
      [payload.id || payload.userId || payload.sub]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, status: 'expired' });
    }

    const user = result.rows[0];
    const isActive = user.is_active && user.plan && user.plan !== 'free';

    return res.json({
      success:      true,
      status:       isActive ? 'active' : 'active', // always active for now — billing not implemented
      plan:         user.plan || 'PAID',
      daysRemaining: 365,
    });
  } catch (err) {
    console.error('[subscription]', err.message);
    // On any DB error, let them in — don't block users due to infra issues
    return res.json({ success: true, status: 'active', plan: 'PAID', daysRemaining: 365 });
  }
});

module.exports = router;