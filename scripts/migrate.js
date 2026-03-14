/**
 * scripts/migrate.js
 * Run: node scripts/migrate.js
 *
 * Safe to run multiple times — skips already-ran migrations.
 * Handles partially-created tables via ALTER TABLE ADD COLUMN IF NOT EXISTS.
 */

'use strict';

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const migrations = [

  // 001: Core users table
  {
    id: '001_users',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id                SERIAL PRIMARY KEY,
        name              VARCHAR(255) NOT NULL,
        mobile            VARCHAR(15)  NOT NULL UNIQUE,
        mpin_hash         VARCHAR(255) NOT NULL,
        plan              VARCHAR(50)  DEFAULT 'FREE',
        is_active         BOOLEAN      DEFAULT true,
        role              VARCHAR(20)  DEFAULT 'user',
        notes             TEXT,
        flagged           BOOLEAN      DEFAULT false,
        flag_reason       TEXT,
        angel_client_code VARCHAR(20),
        created_at        TIMESTAMPTZ  DEFAULT NOW()
      );

      -- Safely add columns that may be missing from a partial table
      ALTER TABLE users ADD COLUMN IF NOT EXISTS flagged           BOOLEAN     DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS flag_reason       TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS angel_client_code VARCHAR(20);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS notes             TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role              VARCHAR(20) DEFAULT 'user';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active         BOOLEAN     DEFAULT true;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS plan              VARCHAR(50) DEFAULT 'FREE';

      CREATE INDEX IF NOT EXISTS idx_users_mobile  ON users(mobile);
      CREATE INDEX IF NOT EXISTS idx_users_plan    ON users(plan);
      CREATE INDEX IF NOT EXISTS idx_users_flagged ON users(flagged);
    `,
  },

  // 002: Trusted devices + OTP
  {
    id: '002_trusted_devices',
    sql: `
      CREATE TABLE IF NOT EXISTS trusted_devices (
        id               SERIAL PRIMARY KEY,
        user_id          INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id        VARCHAR(255) NOT NULL,
        device_name      VARCHAR(255),
        device_hash      VARCHAR(512) NOT NULL,
        platform         VARCHAR(50),
        ip_address       VARCHAR(50),
        is_trusted       BOOLEAN      DEFAULT false,
        trust_expires_at TIMESTAMPTZ,
        verified_at      TIMESTAMPTZ,
        last_seen_at     TIMESTAMPTZ  DEFAULT NOW(),
        created_at       TIMESTAMPTZ  DEFAULT NOW(),
        UNIQUE(user_id, device_id)
      );
      CREATE TABLE IF NOT EXISTS device_otp (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id  VARCHAR(255) NOT NULL,
        otp_hash   VARCHAR(255) NOT NULL,
        attempts   INTEGER      DEFAULT 0,
        expires_at TIMESTAMPTZ  NOT NULL,
        used       BOOLEAN      DEFAULT false,
        created_at TIMESTAMPTZ  DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_trusted_devices_user ON trusted_devices(user_id, device_id);
      CREATE INDEX IF NOT EXISTS idx_device_otp_user      ON device_otp(user_id, device_id);
    `,
  },

  // 003: Remember-me tokens
  {
    id: '003_remember_tokens',
    sql: `
      CREATE TABLE IF NOT EXISTS remember_tokens (
        id           SERIAL PRIMARY KEY,
        user_id      INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        device_id    VARCHAR(255) NOT NULL,
        token_hash   VARCHAR(255) NOT NULL UNIQUE,
        ip_address   VARCHAR(50),
        user_agent   TEXT,
        last_used_at TIMESTAMPTZ  DEFAULT NOW(),
        expires_at   TIMESTAMPTZ  NOT NULL,
        created_at   TIMESTAMPTZ  DEFAULT NOW(),
        UNIQUE(user_id, device_id)
      );
      CREATE INDEX IF NOT EXISTS idx_remember_tokens_hash    ON remember_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_remember_tokens_expires ON remember_tokens(expires_at);
    `,
  },

  // 004: Admin + activity tables
  {
    id: '004_admin_tables',
    sql: `
      CREATE TABLE IF NOT EXISTS admin_audit_log (
        id             SERIAL PRIMARY KEY,
        admin_id       INTEGER,
        action         VARCHAR(100) NOT NULL,
        target_user_id INTEGER,
        payload        JSONB,
        success        BOOLEAN      DEFAULT true,
        ip_address     VARCHAR(50),
        user_agent     TEXT,
        created_at     TIMESTAMPTZ  DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS admin_announcements (
        id         SERIAL PRIMARY KEY,
        title      VARCHAR(255) NOT NULL,
        body       TEXT         NOT NULL,
        type       VARCHAR(20)  DEFAULT 'info',
        target     VARCHAR(20)  DEFAULT 'all',
        is_active  BOOLEAN      DEFAULT true,
        created_by INTEGER,
        created_at TIMESTAMPTZ  DEFAULT NOW(),
        expires_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS user_activity (
        user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        total_logins   INTEGER     DEFAULT 0,
        last_login_at  TIMESTAMPTZ,
        last_login_ip  VARCHAR(50),
        last_device    VARCHAR(255),
        session_count  INTEGER     DEFAULT 0,
        failed_logins  INTEGER     DEFAULT 0,
        last_failed_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS subscription_history (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_from   VARCHAR(50),
        plan_to     VARCHAR(50),
        changed_by  INTEGER,
        reason      TEXT,
        amount      NUMERIC(10,2),
        payment_ref VARCHAR(255),
        created_at  TIMESTAMPTZ   DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_log_created  ON admin_audit_log(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sub_history_user   ON subscription_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_activity_last ON user_activity(last_login_at DESC);
    `,
  },

  // 005: Admins table
  {
    id: '005_admins',
    sql: `
      CREATE TABLE IF NOT EXISTS admins (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(255) NOT NULL,
        mobile     VARCHAR(15)  NOT NULL UNIQUE,
        mpin_hash  VARCHAR(255) NOT NULL,
        is_active  BOOLEAN      DEFAULT true,
        created_at TIMESTAMPTZ  DEFAULT NOW()
      );
    `,
  },

];

async function run() {
  const client = await pool.connect();
  try {
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations_log (
        id        SERIAL PRIMARY KEY,
        migration VARCHAR(255) UNIQUE NOT NULL,
        ran_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // IMPORTANT: Remove 001_users from migrations_log if it failed before
    // so we can re-run it cleanly with the ALTER TABLE fixes
    const { rows: existing } = await client.query(
      `SELECT id FROM migrations_log WHERE migration = '001_users'`
    );
    if (existing.length > 0) {
      // Check if flagged column actually exists
      const { rows: cols } = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'flagged'
      `);
      if (cols.length === 0) {
        console.log('  ⚠  001_users log entry found but table is incomplete — re-running...');
        await client.query(`DELETE FROM migrations_log WHERE migration = '001_users'`);
      }
    }

    let ran = 0;
    for (const m of migrations) {
      const { rows } = await client.query(
        `SELECT id FROM migrations_log WHERE migration = $1`, [m.id]
      );
      if (rows.length > 0) {
        console.log(`  ⊘  ${m.id} — already ran`);
        continue;
      }
      console.log(`  ▶  Running ${m.id}...`);
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query(`INSERT INTO migrations_log (migration) VALUES ($1)`, [m.id]);
        await client.query('COMMIT');
        console.log(`  ✓  ${m.id} — done`);
        ran++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗  ${m.id} — FAILED: ${err.message}`);
        throw err;
      }
    }
    console.log(`\n  ✅ Done. ${ran} migration(s) ran.\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('\n[Migrate] Fatal:', err.message);
  process.exit(1);
});