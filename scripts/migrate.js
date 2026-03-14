/**
 * scripts/migrate.js
 * Run: node scripts/migrate.js
 *
 * Runs ALL migrations in order. Safe to run multiple times —
 * every migration uses IF NOT EXISTS / IF NOT EXISTS patterns.
 * Tracks which migrations have run in a migrations_log table.
 */

'use strict';

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── All migrations in order ──────────────────────────────────────────────────
const migrations = [

  // ─── 001: Core users table extensions ─────────────────────────────────────
  {
    id: '001_users_extensions',
    sql: `
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS role          VARCHAR(20)  DEFAULT 'user',
        ADD COLUMN IF NOT EXISTS notes         TEXT,
        ADD COLUMN IF NOT EXISTS flagged       BOOLEAN      DEFAULT false,
        ADD COLUMN IF NOT EXISTS flag_reason   TEXT,
        ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS login_count   INTEGER      DEFAULT 0,
        ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ  DEFAULT NOW();

      CREATE INDEX IF NOT EXISTS idx_users_role    ON users(role);
      CREATE INDEX IF NOT EXISTS idx_users_plan    ON users(plan);
      CREATE INDEX IF NOT EXISTS idx_users_flagged ON users(flagged);
      CREATE INDEX IF NOT EXISTS idx_users_mobile  ON users(mobile);
    `,
  },

  // ─── 002: Trusted devices + OTP ───────────────────────────────────────────
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

      CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_device ON trusted_devices(user_id, device_id);
      CREATE INDEX IF NOT EXISTS idx_device_otp_user_device      ON device_otp(user_id, device_id);
    `,
  },

  // ─── 003: Remember-me tokens ──────────────────────────────────────────────
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

  // ─── 004: Admin tables ────────────────────────────────────────────────────
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
        user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        total_logins  INTEGER     DEFAULT 0,
        last_login_at TIMESTAMPTZ,
        last_login_ip VARCHAR(50),
        last_device   VARCHAR(255),
        session_count INTEGER     DEFAULT 0,
        failed_logins INTEGER     DEFAULT 0,
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

      CREATE INDEX IF NOT EXISTS idx_audit_log_admin    ON admin_audit_log(admin_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_target   ON admin_audit_log(target_user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_created  ON admin_audit_log(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sub_history_user   ON subscription_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_activity_last ON user_activity(last_login_at DESC);
    `,
  },

  // ─── 005: Angel One credentials ───────────────────────────────────────────
  {
    id: '005_angel_credentials',
    sql: `
      CREATE TABLE IF NOT EXISTS angel_credentials (
        user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        api_key     TEXT NOT NULL,
        client_code VARCHAR(50) NOT NULL,
        mpin        TEXT NOT NULL,
        totp_secret TEXT,
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      );
    `,
  },
];

// ─── Migration runner ─────────────────────────────────────────────────────────
async function run() {
  const client = await pool.connect();

  try {
    // Create migrations tracking table
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations_log (
        id         SERIAL PRIMARY KEY,
        migration  VARCHAR(255) UNIQUE NOT NULL,
        ran_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    let ran = 0;
    for (const migration of migrations) {
      // Check if already ran
      const { rows } = await client.query(
        `SELECT id FROM migrations_log WHERE migration = $1`,
        [migration.id]
      );
      if (rows.length > 0) {
        console.log(`  ⊘  ${migration.id} — already ran, skipping`);
        continue;
      }

      console.log(`  ▶  Running ${migration.id}...`);
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO migrations_log (migration) VALUES ($1)`,
          [migration.id]
        );
        await client.query('COMMIT');
        console.log(`  ✓  ${migration.id} — done`);
        ran++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗  ${migration.id} — FAILED: ${err.message}`);
        throw err;
      }
    }

    console.log(`\n  Migrations complete. ${ran} new migration(s) ran.\n`);

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('\n[Migrate] Fatal error:', err.message);
  process.exit(1);
});
