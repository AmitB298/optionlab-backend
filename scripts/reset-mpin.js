/**
 * Reset admin MPIN in Railway DB
 * Usage: DATABASE_URL=... node scripts/reset-mpin.js
 * Edit MOBILE and NEW_MPIN below before running.
 */
'use strict';
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

const MOBILE   = '9999999999'; // change if needed
const NEW_MPIN = '112233';      // change to desired MPIN

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

bcrypt.hash(NEW_MPIN, 10).then(hash =>
  pool.query('UPDATE admins SET mpin_hash=$1 WHERE mobile=$2', [hash, MOBILE])
).then(r => {
  console.log('Done, rows updated:', r.rowCount);
  pool.end();
}).catch(e => { console.error(e.message); pool.end(); });
