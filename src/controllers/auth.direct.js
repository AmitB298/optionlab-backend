'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET || 'optionlab-secret-2024';

async function register(req, res) {
  const { name, mobile, mpin, angel_client_code } = req.body;
  if (!name || !mobile || !mpin) return res.status(400).json({ success:false, message:'name, mobile and mpin are required' });
  if (!/^[6-9]\d{9}$/.test(mobile)) return res.status(400).json({ success:false, message:'Invalid mobile number' });
  if (!/^\d{6}$/.test(mpin)) return res.status(400).json({ success:false, message:'MPIN must be 6 digits' });
  try {
    const exists = await pool.query('SELECT id FROM users WHERE mobile=$1', [mobile]);
    if (exists.rows.length) return res.status(409).json({ success:false, message:'Mobile already registered' });
    const hash = await bcrypt.hash(mpin, 10);
    const result = await pool.query(
      `INSERT INTO users (name, mobile, mpin_hash, angel_client_code, plan, is_active, role, created_at)
       VALUES ($1,$2,$3,$4,'FREE',true,'user',NOW())
       RETURNING id, name, mobile, angel_client_code, plan, is_active, role, created_at`,
      [name, mobile, hash, angel_client_code || null]
    );
    const user = result.rows[0];
    const token = jwt.sign({ id:user.id, mobile:user.mobile, role:user.role }, JWT_SECRET, { expiresIn:'30d' });
    return res.json({ success:true, message:'Registration successful', token, user: { ...user, subscriptionStatus:'active', daysRemaining:365 } });
  } catch(err) { console.error('[register]', err.message); return res.status(500).json({ success:false, message:'Server error' }); }
}

async function loginMpin(req, res) {
  const { mobile, mpin } = req.body;
  if (!mobile || !mpin) return res.status(400).json({ success:false, message:'mobile and mpin required' });
  try {
    const result = await pool.query(
      'SELECT id,name,mobile,mpin_hash,angel_client_code,plan,is_active,role,flagged,created_at FROM users WHERE mobile=$1', [mobile]
    );
    if (!result.rows.length) return res.status(401).json({ success:false, message:'Invalid mobile or MPIN' });
    const user = result.rows[0];
    if (!await bcrypt.compare(mpin, user.mpin_hash)) return res.status(401).json({ success:false, message:'Invalid mobile or MPIN' });
    if (!user.is_active) return res.status(403).json({ success:false, message:'Account disabled. Contact support.' });
    if (user.flagged) return res.status(403).json({ success:false, message:'Account under review. Contact support.' });
    const token = jwt.sign({ id:user.id, mobile:user.mobile, role:user.role }, JWT_SECRET, { expiresIn:'30d' });
    return res.json({ success:true, token, user: { id:user.id, name:user.name, mobile:user.mobile, angel_client_code:user.angel_client_code, plan:user.plan||'FREE', is_active:user.is_active, role:user.role, created_at:user.created_at, subscriptionStatus:'active', daysRemaining:365 } });
  } catch(err) { console.error('[login]', err.message); return res.status(500).json({ success:false, message:'Server error' }); }
}

async function changeMpin(req, res) {
  const { mobile, currentMpin, newMpin } = req.body;
  if (!mobile || !currentMpin || !newMpin) return res.status(400).json({ success:false, message:'mobile, currentMpin and newMpin required' });
  if (!/^\d{6}$/.test(newMpin)) return res.status(400).json({ success:false, message:'New MPIN must be 6 digits' });
  try {
    const result = await pool.query('SELECT id,mpin_hash FROM users WHERE mobile=$1', [mobile]);
    if (!result.rows.length) return res.status(404).json({ success:false, message:'User not found' });
    if (!await bcrypt.compare(currentMpin, result.rows[0].mpin_hash)) return res.status(401).json({ success:false, message:'Current MPIN incorrect' });
    await pool.query('UPDATE users SET mpin_hash=$1 WHERE mobile=$2', [await bcrypt.hash(newMpin,10), mobile]);
    return res.json({ success:true, message:'MPIN updated successfully' });
  } catch(err) { console.error('[change-mpin]', err.message); return res.status(500).json({ success:false, message:'Server error' }); }
}

async function updateProfile(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success:false, message:'No token' });
  try {
    const decoded = jwt.verify(authHeader.replace('Bearer ',''), JWT_SECRET);
    const allowed = ['name','notes'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    if (!Object.keys(updates).length) return res.status(400).json({ success:false, message:'No updatable fields' });
    const setClauses = Object.keys(updates).map((k,i) => `${k}=$${i+1}`).join(', ');
    const values = [...Object.values(updates), decoded.id];
    await pool.query(`UPDATE users SET ${setClauses} WHERE id=$${values.length}`, values);
    return res.json({ success:true, message:'Profile updated' });
  } catch(err) { console.error('[update-profile]', err.message); return res.status(500).json({ success:false, message:'Server error' }); }
}

module.exports = { register, loginMpin, changeMpin, updateProfile };
