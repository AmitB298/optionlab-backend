const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.connect().then(async client => {
  try {
    await client.query('DELETE FROM admins');
    const hash = await bcrypt.hash('YOUR_REAL_MPIN', 10);
    await client.query(
      'INSERT INTO admins (name, mobile, mpin_hash) VALUES ($1, $2, $3)',
      ['YOUR_NAME', 'YOUR_MOBILE', hash]
    );
    console.log('Admin updated with real credentials!');
  } finally { client.release(); await pool.end(); }
}).catch(e => { console.error(e.message); process.exit(1); });
