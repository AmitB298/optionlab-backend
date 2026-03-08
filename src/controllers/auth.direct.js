// src/controllers/auth.direct.js
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET || 'optionlab-secret-2024';

// POST /api/auth/register
async function register(req, res) {
  const { name, mobile, mpin, angel_one_client_id } = req.body;
  if (!name || !mobile || !mpin) return res.status(400).json({ success:false, message:'name, mobile and mpin are required' });
  if (!/^[6-9]\d{9}$/.test(mobile)) return res.status(400).json({ success:false, message:'Invalid mobile number' });
  if (!/^\d{6}$/.test(mpin)) return res.status(400).json({ success:false, message:'MPIN must be 6 digits' });
  try {
    const exists = await pool.query('SELECT id FROM users WHERE mobile=$1', [mobile]);
    if (exists.rows.length) return res.status(409).json({ success:false, message:'Mobile number already registered' });
    const hash = await bcrypt.hash(mpin, 10);
    const result = await pool.query(
      `INSERT INTO users (mobile, mpin_hash, name, angel_one_client_id, is_active, is_mpin_set, created_at, updated_at)
       VALUES ($1,$2,$3,$4,true,true,NOW(),NOW()) RETURNING id, mobile, name, angel_one_client_id, is_active, is_mpin_set, created_at`,
      [mobile, hash, name, angel_one_client_id || null]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, mobile: user.mobile }, JWT_SECRET, { expiresIn: '30d' });
    return res.json({ success:true, message:'Registration successful', token, user });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success:false, message:'Server error' });
  }
}

// POST /api/auth/login-mpin
async function loginMpin(req, res) {
  const { mobile, mpin } = req.body;
  if (!mobile || !mpin) return res.status(400).json({ success:false, message:'mobile and mpin are required' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE mobile=$1', [mobile]);
    if (!result.rows.length) return res.status(401).json({ success:false, message:'Invalid mobile or MPIN' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(mpin, user.mpin_hash);
    if (!valid) return res.status(401).json({ success:false, message:'Invalid mobile or MPIN' });
    const token = jwt.sign({ id: user.id, mobile: user.mobile }, JWT_SECRET, { expiresIn: '30d' });
    return res.json({ success:true, token, user: {
      id: user.id, mobile: user.mobile, name: user.name,
      angel_one_client_id: user.angel_one_client_id,
      plan: user.plan || 'free', is_active: user.is_active, is_mpin_set: user.is_mpin_set,
      created_at: user.created_at
    }});
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success:false, message:'Server error' });
  }
}

// POST /api/auth/change-mpin
async function changeMpin(req, res) {
  const { mobile, currentMpin, newMpin } = req.body;
  if (!mobile || !currentMpin || !newMpin) return res.status(400).json({ success:false, message:'mobile, currentMpin and newMpin required' });
  if (!/^\d{6}$/.test(newMpin)) return res.status(400).json({ success:false, message:'New MPIN must be 6 digits' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE mobile=$1', [mobile]);
    if (!result.rows.length) return res.status(404).json({ success:false, message:'User not found' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(currentMpin, user.mpin_hash);
    if (!valid) return res.status(401).json({ success:false, message:'Current MPIN is incorrect' });
    const hash = await bcrypt.hash(newMpin, 10);
    await pool.query('UPDATE users SET mpin_hash=$1, updated_at=NOW() WHERE mobile=$2', [hash, mobile]);
    return res.json({ success:true, message:'MPIN updated successfully' });
  } catch (err) {
    console.error('Change MPIN error:', err);
    return res.status(500).json({ success:false, message:'Server error' });
  }
}

// PATCH /api/auth/update-profile
async function updateProfile(req, res) {
  // Get user from JWT
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success:false, message:'No token' });
  try {
    const token = authHeader.replace('Bearer ','');
    const decoded = jwt.verify(token, JWT_SECRET);
    // Only allow safe fields — mobile and angel_one_client_id are locked
    const allowed = ['name', 'email'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    if (!Object.keys(updates).length) return res.status(400).json({ success:false, message:'No updatable fields provided' });
    const setClauses = Object.keys(updates).map((k,i) => `${k}=$${i+1}`).join(', ');
    const values = [...Object.values(updates), decoded.id];
    await pool.query(`UPDATE users SET ${setClauses}, updated_at=NOW() WHERE id=$${values.length}`, values);
    return res.json({ success:true, message:'Profile updated' });
  } catch (err) {
    console.error('Update profile error:', err);
    return res.status(500).json({ success:false, message:'Server error' });
  }
}

module.exports = { register, loginMpin, changeMpin, updateProfile };
