const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:MsbhWaBlBEjCrtPUTXUaydgkabfNuogC@metro.proxy.rlwy.net:10759/railway',
  ssl: { rejectUnauthorized: false },
});
async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      mobile TEXT UNIQUE NOT NULL,
      mpin_hash TEXT,
      password_hash TEXT,
      role TEXT DEFAULT 'admin',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('admins table OK');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id SERIAL PRIMARY KEY,
      admin_id INTEGER,
      action TEXT,
      ip_address TEXT,
      success BOOLEAN,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('admin_audit_log table OK');
  const hash = await bcrypt.hash('1234', 10);
  await pool.query(`
    INSERT INTO admins (name, email, mobile, mpin_hash, role, is_active)
    VALUES ('Amit', 'amit@optionslab.in', '9811199900', $1, 'superadmin', true)
    ON CONFLICT (mobile) DO UPDATE SET mpin_hash = $1, is_active = true
  `, [hash]);
  console.log('Admin seeded: 9811199900 / 1234');
  await pool.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
