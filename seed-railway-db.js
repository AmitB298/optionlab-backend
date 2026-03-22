// node seed-railway-db.js
// Seeds a user directly into Railway's PostgreSQL DB

const bcrypt = require('bcrypt');
const { Pool } = require('pg');

// Railway public proxy URL (from `railway variables`)
// The internal URL is postgres.railway.internal — need the public proxy
// Format: postgresql://postgres:<password>@<public-host>:<port>/railway
// Run: railway variables to get DATABASE_PUBLIC_URL or POSTGRES_URL

// Try the metro proxy (common Railway pattern)
const pool = new Pool({
  connectionString: 'postgresql://postgres:MsbhWaBlBEjCrtPUTXUaydgkabfNuogC@metro.proxy.rlwy.net:10759/railway',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log('Connecting to Railway DB via public proxy...\n');

  try {
    // Test connection
    const test = await pool.query('SELECT NOW() as time');
    console.log('✅ Connected! DB time:', test.rows[0].time);

    // Show tables
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name
    `);
    console.log('\nTables:', tables.rows.map(r => r.table_name).join(', '));

    // Show users table columns
    const cols = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' ORDER BY ordinal_position
    `);
    console.log('Users columns:', cols.rows.map(r => r.column_name).join(', '));

    // Show existing users
    const users = await pool.query('SELECT id, mobile, email, plan, is_active FROM users LIMIT 5');
    console.log('\nExisting users:');
    console.table(users.rows);

    // Hash MPIN
    const mpinHash = await bcrypt.hash('123456', 12);
    console.log('\nInserting/updating user...');

    // Insert user - bypassing email verification entirely
    const result = await pool.query(`
      INSERT INTO users (name, email, mobile, mpin_hash, plan, is_active, role, created_at)
      VALUES ('Amit', 'amit@optionslab.in', '9999999999', $1, 'FREE', true, 'user', NOW())
      ON CONFLICT (mobile) DO UPDATE SET
        mpin_hash = EXCLUDED.mpin_hash,
        is_active = true
      RETURNING id, name, email, mobile, plan, is_active
    `, [mpinHash]);

    console.log('\n✅ User created/updated:');
    console.table(result.rows);
    console.log('\nLogin at localhost:5173 with:');
    console.log('  Mobile: 9999999999');
    console.log('  MPIN:   123456');

  } catch (err) {
    console.error('❌ Error:', err.message);

    // If column names differ, show what's available
    if (err.message.includes('column')) {
      console.log('\nChecking actual column names...');
      try {
        const cols = await pool.query(`
          SELECT column_name, data_type FROM information_schema.columns
          WHERE table_name = 'users' ORDER BY ordinal_position
        `);
        console.table(cols.rows);
      } catch (e2) {
        console.error('Could not get columns:', e2.message);
      }
    }
  } finally {
    await pool.end();
  }
}

main();
