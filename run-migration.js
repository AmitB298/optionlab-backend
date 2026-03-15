/**
 * run-migration.js
 * Patches src/index.js to run app_sessions migration on every startup.
 * Safe — uses CREATE TABLE IF NOT EXISTS, so it's idempotent.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── 1. Create src/db/migrate-startup.js ─────────────────────────────────────
const migrationCode = `'use strict';

/**
 * migrate-startup.js
 * Runs on every server start. All queries use IF NOT EXISTS — safe to re-run.
 */

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function runMigrations() {
  try {
    // app_sessions — tracks Jobber app heartbeats (NO broker credentials)
    await pool.query(\`
      CREATE TABLE IF NOT EXISTS app_sessions (
        user_id             INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        app_version         VARCHAR(20),
        platform            VARCHAR(50),
        is_market_connected BOOLEAN DEFAULT false,
        last_seen_at        TIMESTAMPTZ DEFAULT NOW(),
        ip_address          VARCHAR(45),
        created_at          TIMESTAMPTZ DEFAULT NOW()
      )
    \`);

    // Add missing columns to users table (safe if already exist)
    await pool.query(\`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ\`);
    await pool.query(\`ALTER TABLE users ADD COLUMN IF NOT EXISTS total_logins INTEGER DEFAULT 0\`);
    await pool.query(\`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(45)\`);

    console.log('✓ DB migrations OK');
  } catch (err) {
    console.error('⚠ Migration warning:', err.message);
    // Non-fatal — server continues even if migration fails
  } finally {
    await pool.end().catch(() => {});
  }
}

module.exports = runMigrations;
`;

const dbDir = path.join(__dirname, 'src', 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
fs.writeFileSync(path.join(dbDir, 'migrate-startup.js'), migrationCode, 'utf8');
console.log('✓ Created src/db/migrate-startup.js');

// ─── 2. Patch index.js to call migration on startup ──────────────────────────
const indexPath = path.join(__dirname, 'src', 'index.js');
let index = fs.readFileSync(indexPath, 'utf8');

if (index.includes('migrate-startup')) {
  console.log('✓ index.js already has migration call — skipping');
} else {
  // Add require at top after 'use strict' or first require
  const insertAfter = `'use strict';`;
  const migrationCall = `
// ─── Run DB migrations on startup ────────────────────────────────────────────
require('./db/migrate-startup')().catch(e => console.warn('Migration skipped:', e.message));
`;

  if (index.includes(insertAfter)) {
    index = index.replace(insertAfter, insertAfter + '\n' + migrationCall);
  } else {
    // Prepend to file
    index = migrationCall + '\n' + index;
  }

  fs.writeFileSync(indexPath, index, 'utf8');
  console.log('✓ Patched index.js — migration runs on every startup');
}

// ─── 3. Verify ───────────────────────────────────────────────────────────────
const final = fs.readFileSync(indexPath, 'utf8');
console.log('✓ Migration in index.js:', final.includes('migrate-startup'));
console.log('\nDone — run: git add -A && git commit -m "feat: auto-migrate app_sessions on startup" && git push');