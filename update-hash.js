const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:MsbhWaBlBEjCrtPUTXUaydgkabfNuogC@metro.proxy.rlwy.net:10759/railway',
  ssl: { rejectUnauthorized: false }
});

// bcryptjs-generated hash for 'admin123'
const hash = '$2a$12$iAYpy4nXOlguC4tde0RHK.o1QJ9dgphTIyNrMXwbVb2sIq8BgOVJW';

pool.query(
  'UPDATE blog_authors SET password_hash=$1 WHERE email=$2',
  [hash, 'amit@optionslab.in']
).then(r => {
  console.log('✅ Password hash updated, rows affected:', r.rowCount);
  pool.end();
}).catch(e => {
  console.error('ERROR:', e.message);
  pool.end();
});
