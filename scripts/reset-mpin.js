const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
bcrypt.hash('112233', 10).then(hash =>
  pool.query('UPDATE admins SET mpin_hash=$1 WHERE mobile=$2', [hash, '9999999999'])
).then(r => { console.log('Done, rows updated:', r.rowCount); pool.end(); })
.catch(e => { console.error(e.message); pool.end(); });
