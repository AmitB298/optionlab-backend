'use strict';
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  try {
    // Create app_sessions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_sessions (
        user_id             INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        app_version         VARCHAR(20),
        platform            VARCHAR(50),
        is_market_connected BOOLEAN DEFAULT false,
        last_seen_at        TIMESTAMPTZ DEFAULT NOW(),
        ip_address          VARCHAR(45),
        created_at          TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✓ app_sessions table ready');

    // Add last_login_at to users if missing
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ
    `);
    console.log('✓ users.last_login_at column ready');

    // Add total_logins to users if missing
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS total_logins INTEGER DEFAULT 0
    `);
    console.log('✓ users.total_logins column ready');

    console.log('\n✅ Migration complete');
  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
