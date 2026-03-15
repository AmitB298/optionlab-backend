'use strict';

/**
 * migrate-startup.js
 * Runs on every server start. All queries use IF NOT EXISTS — safe to re-run.
 */

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function runMigrations() {
  try {
    // app_sessions — tracks Jobber app heartbeats (NO broker credentials)
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

    // Add missing columns to users table (safe if already exist)
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS total_logins INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(45)`);

    console.log('✓ DB migrations OK');
  } catch (err) {
    console.error('⚠ Migration warning:', err.message);
    // Non-fatal — server continues even if migration fails
  } finally {
    await pool.end().catch(() => {});
  }
}

module.exports = runMigrations;
