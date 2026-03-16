'use strict';
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('error', (err) => {
  console.error('[Pool] Unexpected error:', err.message);
});

module.exports = pool;
