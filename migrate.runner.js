#!/usr/bin/env node
/**
 * scripts/migrate.js
 *
 * Runs SQL migration files in order from the /migrations folder.
 * Safe to run multiple times — tracks completed migrations in
 * migrations_log table and skips already-applied ones.
 *
 * Usage:
 *   node scripts/migrate.js                 ← run all pending
 *   node scripts/migrate.js --dry-run       ← show what would run
 *   node scripts/migrate.js --list          ← list applied migrations
 *   node scripts/migrate.js --force 003     ← re-run a specific migration
 */

'use strict';

const { Pool } = require('pg');
const fs       = require('fs');
const path     = require('path');

// ── Config ────────────────────────────────────────────────────
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

// ── Flags ─────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIST    = args.includes('--list');
const FORCE   = args.includes('--force') ? args[args.indexOf('--force') + 1] : null;

// ── Helpers ───────────────────────────────────────────────────
const log  = (...m) => console.log('[migrate]', ...m);
const err  = (...m) => console.error('[migrate] ERROR:', ...m);
const ok   = (...m) => console.log('[migrate] ✓', ...m);
const skip = (...m) => console.log('[migrate] ⊘', ...m);

// ── Bootstrap migrations_log table ───────────────────────────
async function ensureLogTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS migrations_log (
      id           SERIAL      PRIMARY KEY,
      filename     VARCHAR(255) NOT NULL UNIQUE,
      applied_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      duration_ms  INTEGER,
      checksum     VARCHAR(64)
    );
  `);
}

// ── Get applied migration filenames ──────────────────────────
async function getApplied(client) {
  const res = await client.query(
    'SELECT filename FROM migrations_log ORDER BY filename'
  );
  return new Set(res.rows.map(r => r.filename));
}

// ── Simple checksum (length + first 64 chars) ─────────────────
function checksum(sql) {
  const s = sql.replace(/\s+/g, ' ').trim();
  return `${s.length}:${s.slice(0, 64)}`;
}

// ── Run a single SQL file inside a transaction ────────────────
async function runFile(client, filename, sql) {
  const start = Date.now();
  try {
    await client.query('BEGIN');
    await client.query(sql);

    if (!DRY_RUN) {
      await client.query(
        `INSERT INTO migrations_log (filename, duration_ms, checksum)
         VALUES ($1, $2, $3)
         ON CONFLICT (filename) DO UPDATE
           SET applied_at  = NOW(),
               duration_ms = EXCLUDED.duration_ms,
               checksum    = EXCLUDED.checksum`,
        [filename, Date.now() - start, checksum(sql)]
      );
    }

    await client.query('COMMIT');
    ok(`${filename} (${Date.now() - start}ms)`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw new Error(`Failed in ${filename}: ${e.message}`);
  }
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();

  try {
    await ensureLogTable(client);

    // --list flag
    if (LIST) {
      const res = await client.query(
        'SELECT filename, applied_at, duration_ms FROM migrations_log ORDER BY filename'
      );
      if (res.rows.length === 0) {
        log('No migrations applied yet.');
      } else {
        log('Applied migrations:');
        res.rows.forEach(r =>
          log(`  ${r.filename}  (${r.applied_at.toISOString()}, ${r.duration_ms}ms)`)
        );
      }
      return;
    }

    // Read migration files — must be named NNN_*.sql (e.g. 001_init.sql)
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter(f => /^\d{3}_.*\.sql$/.test(f))
      .sort();

    if (files.length === 0) {
      log('No migration files found in', MIGRATIONS_DIR);
      return;
    }

    const applied = await getApplied(client);

    let ran = 0;
    let skipped = 0;

    for (const filename of files) {
      const filePrefix = filename.slice(0, 3); // '003'

      // --force NNN: re-run specific migration regardless
      const shouldForce = FORCE && filePrefix === FORCE;

      if (applied.has(filename) && !shouldForce) {
        skip(`${filename} — already applied`);
        skipped++;
        continue;
      }

      const sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, filename),
        'utf8'
      );

      if (DRY_RUN) {
        log(`[DRY RUN] Would run: ${filename}`);
        ran++;
        continue;
      }

      // If forcing, remove old log entry first
      if (shouldForce) {
        await client.query(
          'DELETE FROM migrations_log WHERE filename = $1',
          [filename]
        );
        log(`Forcing re-run of ${filename}`);
      }

      await runFile(client, filename, sql);
      ran++;
    }

    log('─────────────────────────────────');
    log(`Done. Ran: ${ran} | Skipped: ${skipped}`);

    if (DRY_RUN) {
      log('(Dry run — no changes were made)');
    }

  } catch (e) {
    err(e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
