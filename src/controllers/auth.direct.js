// src/controllers/auth.direct.js
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const directLoginMPIN = async (req, res) => {
  try {
    const { mobile, mpin } = req.body;
    if (!mobile || !mpin) {
      return res.status(400).json({ success: false, message: 'Mobile and MPIN required' });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE mobile = $1',
      [mobile]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid mobile or MPIN' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(401).json({ success: false, message: 'Account is inactive' });
    }

    if (!user.is_mpin_set || !user.mpin_hash) {
      return res.status(401).json({ success: false, message: 'MPIN not set for this account' });
    }

    const valid = await bcrypt.compare(mpin, user.mpin_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid mobile or MPIN' });
    }

    const token = jwt.sign(
      { userId: user.id, mobile: user.mobile },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        mobile: user.mobile,
        name: user.name || '',
        plan: 'PAID',
        subscriptionStatus: 'active',
        daysRemaining: 30,
      },
    });
  } catch (err) {
    console.error('directLoginMPIN error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const checkSubscription = async (req, res) => {
  try {
    return res.json({ success: true, status: 'active', plan: 'PAID', daysRemaining: 30 });
  } catch (err) {
    return res.status(500).json({ success: false, status: 'expired' });
  }
};


const changeMPIN = async (req, res) => {
  try {
    const { mobile, currentMpin, newMpin } = req.body;
    if (!mobile || !currentMpin || !newMpin) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }
    if (!/^\d{6}$/.test(newMpin)) {
      return res.status(400).json({ success: false, message: 'New MPIN must be 6 digits' });
    }
    const result = await pool.query('SELECT * FROM users WHERE mobile = $1', [mobile]);
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'User not found' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(currentMpin, user.mpin_hash);
    if (!valid) return res.status(401).json({ success: false, message: 'Current MPIN is incorrect' });
    const newHash = await bcrypt.hash(newMpin, 10);
    await pool.query('UPDATE users SET mpin_hash = $1, updated_at = NOW() WHERE mobile = $2', [newHash, mobile]);
    return res.json({ success: true, message: 'MPIN updated successfully' });
  } catch (err) {
    console.error('changeMPIN error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { directLoginMPIN, checkSubscription, changeMPIN };
