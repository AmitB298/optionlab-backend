const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query(
  "INSERT INTO users (mobile, mpin_hash, name, email, is_active, is_mpin_set, created_at, updated_at) VALUES ('9999999999', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Test', 't@t.com', true, true, NOW(), NOW()) ON CONFLICT (mobile) DO NOTHING RETURNING id"
).then(r => {
  console.log('Done:', r.rows);
  pool.end();
}).catch(e => {
  console.error('Error:', e.message);
  pool.end();
});
