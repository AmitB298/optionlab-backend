const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function createTestUser() {
  const mpin = '123456';
  const hash = await bcrypt.hash(mpin, 10);
  const result = await pool.query(
    `INSERT INTO users (mobile, mpin_hash, name, email, is_active, is_mpin_set, created_at, updated_at)
     VALUES ($1, $2, 'Test User', 'test@test.com', true, true, NOW(), NOW())
     ON CONFLICT (mobile) DO UPDATE SET mpin_hash = $2, is_active = true, is_mpin_set = true
     RETURNING id, mobile, is_active, is_mpin_set`,
    ['9999999999', hash]
  );
  console.log('Test user created:', result.rows[0]);
  await pool.end();
}
createTestUser().catch(console.error);