const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  // Set test user as permanently active
  const r1 = await pool.query(`
    UPDATE users
    SET plan = 'PAID',
        is_active = true,
        updated_at = NOW()
    WHERE mobile = '9999999999'
    RETURNING id, mobile, plan, is_active
  `);
  console.log('Test user updated:', r1.rows);

  // Show all users and their status
  const r2 = await pool.query(`
    SELECT id, mobile, name, plan, is_active, created_at
    FROM users
    ORDER BY created_at DESC
  `);
  console.log('\nAll users:');
  r2.rows.forEach(u => console.log(` - ${u.mobile} | ${u.name || 'no name'} | plan=${u.plan} | active=${u.is_active}`));

  await pool.end();
}

run().catch(e => { console.error(e.message); process.exit(1); });
