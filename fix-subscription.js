const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fix() {
  const r = await pool.query(
    `UPDATE users SET plan='PAID', is_active=true, updated_at=NOW()
     WHERE mobile='9999999999'
     RETURNING id, mobile, plan, is_active`
  );
  console.log('Updated:', r.rows);
  await pool.end();
}
fix().catch(console.error);
