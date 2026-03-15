'use strict';
const { Pool } = require('pg');
try { require('dotenv').config(); } catch {}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('error', (err) => console.error('[sharedPool] idle client error', err.message));
module.exports = pool;