const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.connect().then(async client => {
  try {
    const hash = await bcrypt.hash('admin1234', 10);
    await client.query(
      'INSERT INTO admins (name, mobile, mpin_hash) VALUES ($1, $2, $3)',
      ['Amit', '9999999999', hash]
    );
    console.log('Admin created! Mobile: 9999999999  MPIN: admin1234');
  } finally {
    client.release();
    await pool.end();
  }
}).catch(e => { console.error(e.message); process.exit(1); });
