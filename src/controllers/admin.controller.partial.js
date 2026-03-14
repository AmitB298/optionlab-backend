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
  } catch(err) { console.error('[adminLogin]', err.message); return res.status(500).json({ success:false, message:'Server error', debug: err.message }); }
}
