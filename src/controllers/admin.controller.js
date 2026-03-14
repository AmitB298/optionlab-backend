'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const JWT_SECRET = process.env.JWT_SECRET || 'optionlab-secret-2024';

async function adminLogin(req, res) {
  const { mobile, mpin } = req.body;
  if (!mobile || !mpin) return res.status(400).json({ success:false, message:'mobile and mpin required' });
  try {
    const result = await pool.query('SELECT * FROM admins WHERE mobile=$1 AND is_active=true', [mobile]);
    if (!result.rows.length) return res.status(401).json({ success:false, message:'Invalid credentials' });
    const admin = result.rows[0];
    if (!await bcrypt.compare(mpin, admin.mpin_hash)) return res.status(401).json({ success:false, message:'Invalid credentials' });
    const token = jwt.sign({ adminId:admin.id, mobile:admin.mobile, role:'admin' }, JWT_SECRET, { expiresIn:'12h' });
    return res.json({ success:true, token, admin:{ id:admin.id, name:admin.name, mobile:admin.mobile } });
  } catch(err) { console.error('[adminLogin]', err.message); return res.status(500).json({ success:false, message:'Server error' }); }
}

async function getDashboardStats(req, res) {
  try {
    const [total, active, paid, free, flagged, recent] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM users WHERE is_active=true'),
      pool.query("SELECT COUNT(*) FROM users WHERE plan='PAID' AND is_active=true"),
      pool.query("SELECT COUNT(*) FROM users WHERE plan='FREE'"),
      pool.query('SELECT COUNT(*) FROM users WHERE flagged=true'),
      pool.query('SELECT id,name,mobile,plan,is_active,created_at FROM users ORDER BY created_at DESC LIMIT 10'),
    ]);
    return res.json({ success:true, stats:{
      totalUsers: parseInt(total.rows[0].count),
      activeUsers: parseInt(active.rows[0].count),
      paidUsers: parseInt(paid.rows[0].count),
      freeUsers: parseInt(free.rows[0].count),
      flaggedUsers: parseInt(flagged.rows[0].count),
    }, recentUsers: recent.rows });
  } catch(err) { console.error('[getDashboardStats]', err.message); return res.status(500).json({ success:false, message:'Server error' }); }
}

async function getAllUsers(req, res) {
  const { page=1, limit=20, search='' } = req.query;
  const offset = (page-1)*limit;
  try {
    let where = 'WHERE 1=1';
    const params = [];
    if (search) { where += ' AND (mobile ILIKE $1 OR name ILIKE $1)'; params.push(`%${search}%`); }
    params.push(limit, offset);
    const pi = params.length;
    const users = await pool.query(
      `SELECT id,name,mobile,angel_client_code,plan,is_active,flagged,role,created_at FROM users ${where} ORDER BY created_at DESC LIMIT $${pi-1} OFFSET $${pi}`,
      params
    );
    const total = await pool.query('SELECT COUNT(*) FROM users');
    return res.json({ success:true, users:users.rows, total:parseInt(total.rows[0].count), page:parseInt(page), pages:Math.ceil(total.rows[0].count/limit) });
  } catch(err) { console.error('[getAllUsers]', err.message); return res.status(500).json({ success:false, message:'Server error' }); }
}

async function addUser(req, res) {
  const { name, mobile, mpin, angel_client_code, plan } = req.body;
  if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) return res.status(400).json({ success:false, message:'Valid mobile required' });
  if (!mpin || !/^\d{6}$/.test(mpin)) return res.status(400).json({ success:false, message:'6-digit MPIN required' });
  try {
    const exists = await pool.query('SELECT id FROM users WHERE mobile=$1', [mobile]);
    if (exists.rows.length) return res.status(409).json({ success:false, message:'Mobile already registered' });
    const hash = await bcrypt.hash(mpin, 10);
    const result = await pool.query(
      `INSERT INTO users (name,mobile,mpin_hash,angel_client_code,plan,is_active,role,created_at)
       VALUES ($1,$2,$3,$4,$5,true,'user',NOW()) RETURNING id,name,mobile,plan`,
      [name||null, mobile, hash, angel_client_code||null, plan||'FREE']
    );
    return res.json({ success:true, message:'User added', user:result.rows[0] });
  } catch(err) { console.error('[addUser]', err.message); return res.status(500).json({ success:false, message:'Server error' }); }
}

async function assignPlan(req, res) {
  const { userId } = req.params;
  const { plan } = req.body;
  const valid = ['FREE','PAID','TRIAL','EXPIRED'];
  if (!valid.includes(plan)) return res.status(400).json({ success:false, message:'Invalid plan. Use FREE, PAID, TRIAL or EXPIRED' });
  try {
    await pool.query('UPDATE users SET plan=$1 WHERE id=$2', [plan, userId]);
    return res.json({ success:true, message:`Plan updated to ${plan}` });
  } catch(err) { console.error('[assignPlan]', err.message); return res.status(500).json({ success:false, message:'Server error' }); }
}

async function toggleUserStatus(req, res) {
  const { userId } = req.params;
  const { isActive } = req.body;
  try {
    await pool.query('UPDATE users SET is_active=$1 WHERE id=$2', [isActive, userId]);
    return res.json({ success:true, message:`User ${isActive?'activated':'deactivated'}` });
  } catch(err) { console.error('[toggleUserStatus]', err.message); return res.status(500).json({ success:false, message:'Server error' }); }
}

async function toggleFlagged(req, res) {
  const { userId } = req.params;
  const { flagged } = req.body;
  try {
    await pool.query('UPDATE users SET flagged=$1 WHERE id=$2', [flagged, userId]);
    return res.json({ success:true, message:`User ${flagged?'flagged':'unflagged'}` });
  } catch(err) { console.error('[toggleFlagged]', err.message); return res.status(500).json({ success:false, message:'Server error' }); }
}

async function setupAdmin(req, res) {
  return res.json({ success:false, message:'Use the create-admin script instead' });
}

async function getUserHistory(req, res) {
  const { userId } = req.params;
  try {
    const user = await pool.query('SELECT id,name,mobile,angel_client_code,plan,is_active,flagged,role,created_at FROM users WHERE id=$1', [userId]);
    return res.json({ success:true, user:user.rows[0]||null });
  } catch(err) { console.error('[getUserHistory]', err.message); return res.status(500).json({ success:false, message:'Server error' }); }
}

module.exports = { adminLogin, getDashboardStats, getAllUsers, addUser, assignPlan, toggleUserStatus, toggleFlagged, setupAdmin, getUserHistory };


