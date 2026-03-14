const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.connect().then(async client => {
  try {
    console.log('Nuclear reset - dropping ALL tables...');
    await client.query('DROP TABLE IF EXISTS device_otp CASCADE');
    await client.query('DROP TABLE IF EXISTS trusted_devices CASCADE');
    await client.query('DROP TABLE IF EXISTS remember_tokens CASCADE');
    await client.query('DROP TABLE IF EXISTS user_activity CASCADE');
    await client.query('DROP TABLE IF EXISTS subscription_history CASCADE');
    await client.query('DROP TABLE IF EXISTS admin_audit_log CASCADE');
    await client.query('DROP TABLE IF EXISTS admin_announcements CASCADE');
    await client.query('DROP TABLE IF EXISTS admins CASCADE');
    await client.query('DROP TABLE IF EXISTS users CASCADE');
    await client.query('DROP TABLE IF EXISTS migrations_log CASCADE');
    console.log('All tables dropped. Database is clean.');
  } finally {
    client.release();
    await pool.end();
  }
}).catch(e => { console.error(e.message); process.exit(1); });
