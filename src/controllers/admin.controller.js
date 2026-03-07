// src/controllers/admin.controller.js
const pool = require('../db/pool');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Admin login
async function adminLogin(req, res) {
  const { email, password } = req.body;
  try {
    const admin = await pool.query('SELECT * FROM admins WHERE email = $1 AND is_active = true', [email]);
    if (admin.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, admin.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { adminId: admin.rows[0].id, email: admin.rows[0].email, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({ success: true, token, admin: { id: admin.rows[0].id, name: admin.rows[0].name, email: admin.rows[0].email } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Dashboard stats
async function getDashboardStats(req, res) {
  try {
    const [totalUsers, activeUsers, paidUsers, trialUsers, expiredUsers, recentUsers] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM users WHERE is_active = true'),
      pool.query(`SELECT COUNT(DISTINCT user_id) FROM user_plans 
                  WHERE is_active = true AND end_date > NOW() AND plan_type != 'trial'`),
      pool.query(`SELECT COUNT(DISTINCT user_id) FROM user_plans 
                  WHERE is_active = true AND end_date > NOW() AND plan_type = 'trial'`),
      pool.query(`SELECT COUNT(*) FROM users u 
                  WHERE NOT EXISTS (
                    SELECT 1 FROM user_plans p 
                    WHERE p.user_id = u.id AND p.is_active = true AND p.end_date > NOW()
                  )`),
      pool.query(`SELECT u.id, u.mobile, u.name, u.created_at, 
                         up.plan_type, up.end_date
                  FROM users u
                  LEFT JOIN user_plans up ON up.user_id = u.id AND up.is_active = true AND up.end_date > NOW()
                  ORDER BY u.created_at DESC LIMIT 10`),
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers: parseInt(totalUsers.rows[0].count),
        activeUsers: parseInt(activeUsers.rows[0].count),
        paidUsers: parseInt(paidUsers.rows[0].count),
        trialUsers: parseInt(trialUsers.rows[0].count),
        expiredUsers: parseInt(expiredUsers.rows[0].count),
      },
      recentUsers: recentUsers.rows,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Get all users with their plan status
async function getAllUsers(req, res) {
  const { page = 1, limit = 20, search = '', status = '' } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = `
      SELECT u.id, u.mobile, u.name, u.email, u.is_active, u.created_at,
             up.plan_type, up.end_date, up.start_date,
             CASE 
               WHEN up.end_date > NOW() AND up.plan_type = 'trial' THEN 'trial'
               WHEN up.end_date > NOW() THEN 'paid'
               ELSE 'expired'
             END as plan_status
      FROM users u
      LEFT JOIN user_plans up ON up.user_id = u.id AND up.is_active = true AND up.end_date > NOW()
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;

    if (search) {
      query += ` AND (u.mobile LIKE $${paramIdx} OR u.name ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }

    query += ` ORDER BY u.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
    params.push(limit, offset);

    const users = await pool.query(query, params);
    const total = await pool.query('SELECT COUNT(*) FROM users');

    res.json({
      success: true,
      users: users.rows,
      total: parseInt(total.rows[0].count),
      page: parseInt(page),
      pages: Math.ceil(total.rows[0].count / limit),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Add new user (admin only - no self-registration)
async function addUser(req, res) {
  const { mobile, name, email, planType, planDays } = req.body;

  if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
    return res.status(400).json({ success: false, message: 'Valid Indian mobile number required' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE mobile = $1', [mobile]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Mobile already registered' });
    }

    // Create user
    const user = await pool.query(
      'INSERT INTO users (mobile, name, email) VALUES ($1, $2, $3) RETURNING id',
      [mobile, name || null, email || null]
    );
    const userId = user.rows[0].id;

    // Assign plan if provided
    if (planType && planDays) {
      const endDate = new Date(Date.now() + planDays * 24 * 60 * 60 * 1000);
      await pool.query(
        'INSERT INTO user_plans (user_id, plan_type, end_date, created_by_admin) VALUES ($1, $2, $3, $4)',
        [userId, planType, endDate, req.admin.adminId]
      );
    }

    // Audit log
    await pool.query(
      'INSERT INTO audit_logs (admin_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [req.admin.adminId, userId, 'USER_ADDED', JSON.stringify({ mobile, planType, planDays })]
    );

    res.json({ success: true, message: 'User added successfully', userId });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Assign/update plan
async function assignPlan(req, res) {
  const { userId } = req.params;
  const { planType, planDays, notes } = req.body;

  const validPlans = ['trial', 'daily', 'weekly', 'monthly', 'yearly', 'lifetime'];
  if (!validPlans.includes(planType)) {
    return res.status(400).json({ success: false, message: 'Invalid plan type' });
  }

  try {
    // Deactivate existing plans
    await pool.query('UPDATE user_plans SET is_active = false WHERE user_id = $1', [userId]);

    // Calculate end date
    const days = planType === 'lifetime' ? 36500 : planDays;
    const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO user_plans (user_id, plan_type, end_date, created_by_admin, notes) VALUES ($1, $2, $3, $4, $5)',
      [userId, planType, endDate, req.admin.adminId, notes || null]
    );

    await pool.query(
      'INSERT INTO audit_logs (admin_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [req.admin.adminId, userId, 'PLAN_ASSIGNED', JSON.stringify({ planType, planDays: days })]
    );

    res.json({ success: true, message: `${planType} plan assigned successfully` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Activate / deactivate user
async function toggleUserStatus(req, res) {
  const { userId } = req.params;
  const { isActive } = req.body;

  try {
    await pool.query('UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2', [isActive, userId]);

    // If deactivating, kill all sessions
    if (!isActive) {
      await pool.query('UPDATE sessions SET is_active = false WHERE user_id = $1', [userId]);
    }

    await pool.query(
      'INSERT INTO audit_logs (admin_id, user_id, action) VALUES ($1, $2, $3)',
      [req.admin.adminId, userId, isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED']
    );

    res.json({ success: true, message: `User ${isActive ? 'activated' : 'deactivated'} successfully` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Setup first admin (one-time, protected by secret key)
async function setupAdmin(req, res) {
  const { name, email, password, secretKey } = req.body;

  if (secretKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(403).json({ success: false, message: 'Invalid secret key' });
  }

  try {
    const existing = await pool.query('SELECT id FROM admins WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Admin already exists' });
    }

    const hash = await bcrypt.hash(password, 12);
    await pool.query('INSERT INTO admins (name, email, password_hash) VALUES ($1, $2, $3)', [name, email, hash]);

    res.json({ success: true, message: 'Admin created successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

// Get user login sessions + plan history
async function getUserHistory(req, res) {
  const { userId } = req.params;
  try {
    const [sessions, plans, user] = await Promise.all([
      pool.query(
        `SELECT id, device_info, ip_address, is_active, last_seen, created_at
         FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [userId]
      ),
      pool.query(
        `SELECT id, plan_type, start_date, end_date, is_active, notes, created_at
         FROM user_plans WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
      ),
      pool.query(
        `SELECT id, mobile, name, email, is_active, created_at FROM users WHERE id = $1`,
        [userId]
      ),
    ]);
    res.json({
      success: true,
      user: user.rows[0] || null,
      sessions: sessions.rows,
      plans: plans.rows,
    });
  } catch (err) {
    console.error('getUserHistory error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = {
  adminLogin,
  getDashboardStats,
  getAllUsers,
  addUser,
  assignPlan,
  toggleUserStatus,
  setupAdmin,
  getUserHistory,
};
