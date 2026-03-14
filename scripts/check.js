const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.connect().then(async client => {
  try {
    console.log('Checking users table...');
    const res = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position"
    );
    console.log('Columns:', res.rows.map(r => r.column_name).join(', '));

    const pk = await client.query(
      "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'users' AND constraint_type = 'PRIMARY KEY'"
    );
    console.log('Primary key:', pk.rows.length ? pk.rows[0].constraint_name : 'NONE - THIS IS THE PROBLEM');
  } finally {
    client.release();
    await pool.end();
  }
}).catch(e => { console.error(e.message); process.exit(1); });
