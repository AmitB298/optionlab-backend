const pool = require('./pool');

async function migrate() {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ
  `);
  console.log('[migrate] plan_expires_at column OK');
}

migrate().catch(e => console.error('[migrate] error:', e.message));
