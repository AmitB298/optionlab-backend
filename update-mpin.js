const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const hash = await bcrypt.hash('123456', 10);
  const result = await pool.query(
    "UPDATE users SET mpin_hash = $1, is_mpin_set = true WHERE mobile = '9999999999' RETURNING id, mobile",
    [hash]
  );
  console.log('Updated:', result.rows);
  await pool.end();
}
main().catch(console.error);
