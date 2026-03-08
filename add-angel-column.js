// Run once to add angel_one_client_id column
// node add-angel-column.js
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS angel_one_client_id VARCHAR(20)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'free'`);
    console.log('Migration done ✓');
  } catch(e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}
migrate();
