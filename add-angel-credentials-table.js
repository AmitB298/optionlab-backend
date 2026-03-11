// add-angel-credentials-table.js
// Run: node add-angel-credentials-table.js
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS angel_credentials (
      id           SERIAL PRIMARY KEY,
      user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
      api_key      TEXT NOT NULL DEFAULT '',
      client_code  TEXT NOT NULL DEFAULT '',
      mpin         TEXT NOT NULL DEFAULT '',
      totp_secret  TEXT NOT NULL DEFAULT '',
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_angel_creds_user ON angel_credentials(user_id);
  `);
  console.log('Migration done ✓ — angel_credentials table ready');
  await pool.end();
}

migrate().catch(e => { console.error(e); process.exit(1); });
