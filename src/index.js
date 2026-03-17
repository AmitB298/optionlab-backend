'use strict';

const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const path     = require('path');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Security headers ────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,  // allow inline scripts in admin.html
}));

// ─── CORS: open to all origins (Railway + any custom domain) ────────────────
app.use(cors({ origin: true, credentials: true }));

// ─── Body parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Trust Railway's proxy (needed for real IPs in rate limiters) ────────────
app.set('trust proxy', 1);

// ─── Health check ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:      'ok',
    service:     'OptionLab API',
    version:     '2.0.0',
    timestamp:   new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ─── Routes ──────────────────────────────────────────────────────────────────
const { adminLogin, adminLogout, adminLoginLimiter } = require('./routes/admin.auth');
const adminRoutes  = require('./routes/admin.routes');
const exportRoutes = require('./routes/export.routes');

// Admin auth (public — no requireAdmin)
app.post('/api/admin/login',  adminLoginLimiter, adminLogin);
app.post('/api/admin/logout', adminLogout);

// Admin protected routes
app.use('/api/admin', adminRoutes);

// Export routes (also protected — admin.routes.js applies requireAdmin internally)
app.use('/api/admin/export', exportRoutes);

// Angel One routes (if they exist)
try {
  const angelRoutes = require('./routes/angel.routes');
  app.use('/api/angel', angelRoutes);
} catch (_) { /* optional — skip if not present */ }

// Auth routes for users
try {
  const authRoutes = require('./routes/auth.routes');
  app.use('/api/auth', authRoutes);
} catch (_) { /* optional */ }

// User routes
try {
  const userRoutes = require('./routes/user.routes');
  app.use('/api/user', userRoutes);
} catch (_) { /* optional */ }

// Device routes
try {
  const deviceRoutes = require('./routes/device.routes');
  app.use('/api/device', deviceRoutes);
} catch (_) { /* optional */ }


// Jobber Pro heartbeat routes
try {
  const jobberRoutes = require('./routes/jobber.routes');
  app.use('/api/jobber', jobberRoutes);
} catch (_) { /* optional */ }
// ─── Static files (admin.html etc) ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// BLOG ROUTES START
app.use('/api/blog', require('./blog/routes'));
const { sitemapHandler, rssHandler } = require('./blog/seo');
app.get('/sitemap.xml', sitemapHandler);
app.get('/rss.xml',     rssHandler);
app.get('/blog',       (req, res) => res.sendFile('blog/index.html', { root: path.join(__dirname, '../public') }));
app.get('/blog/:slug', (req, res) => res.sendFile('blog/post.html',  { root: path.join(__dirname, '../public') }));
// BLOG ROUTES END

// Serve admin.html for /admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

// ─── 404 for unknown API routes ──────────────────────────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({ success: false, message: 'Internal server error' });
});

// ─── Start + run migrations ───────────────────────────────────────────────────
async function start() {
  // Run DB migrations automatically on every deploy
  try {
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations_log (
        id        SERIAL PRIMARY KEY,
        migration VARCHAR(255) UNIQUE NOT NULL,
        ran_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const migrations = [
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
          CREATE INDEX IF NOT EXISTS idx_audit_log_admin   ON admin_audit_log(admin_id);
          CREATE INDEX IF NOT EXISTS idx_audit_log_target  ON admin_audit_log(target_user_id);
          CREATE INDEX IF NOT EXISTS idx_audit_log_created ON admin_audit_log(created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_sub_history_user  ON subscription_history(user_id);
          CREATE INDEX IF NOT EXISTS idx_user_activity_last ON user_activity(last_login_at DESC);
        `,
      },
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

    const client = await pool.connect();
    try {
      let ran = 0;
      for (const m of migrations) {
        const { rows } = await client.query('SELECT id FROM migrations_log WHERE migration = $1', [m.id]);
        if (rows.length > 0) { console.log(`  ⊘  ${m.id} — skipped`); continue; }
        await client.query('BEGIN');
        try {
          await client.query(m.sql);
          await client.query('INSERT INTO migrations_log (migration) VALUES ($1)', [m.id]);
          await client.query('COMMIT');
          console.log(`  ✓  ${m.id} — done`);
          ran++;
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`  ✗  ${m.id} — FAILED: ${err.message}`);
          // Don't crash startup for migration errors (table might already exist)
        }
      }
      console.log(`Migrations: ${ran} new migration(s) ran.`);
    } finally {
      client.release();
      await pool.end();
    }
  } catch (err) {
    console.error('[Startup] Migration error:', err.message);
    // Don't exit — let the server start even if migrations fail
  }

  app.listen(PORT, () => {
    console.log(`\nOptionLab API v2.0.0 running on port ${PORT}`);
    console.log(`Health: http://localhost:${PORT}/health`);
    console.log(`Admin:  http://localhost:${PORT}/admin.html\n`);
  });
}

start().catch(err => {
  console.error('Fatal startup error:', err.message);
  process.exit(1);
});
