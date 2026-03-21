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
  contentSecurityPolicy: false,
}));

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));

// ─── Body parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Trust Railway's proxy ───────────────────────────────────────────────────
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

// Admin auth (public)
app.post('/api/admin/login',  adminLoginLimiter, adminLogin);
app.post('/api/admin/logout', adminLogout);

// Admin protected routes
app.use('/api/admin', adminRoutes);

// Export routes
app.use('/api/admin/export', exportRoutes);

// ─── Optional routes — log errors instead of swallowing them ─────────────────

try {
  const angelRoutes = require('./routes/angel.routes');
  app.use('/api/angel', angelRoutes);
  console.log('[Routes] angel.routes loaded');
} catch (err) { console.error('[Routes] angel.routes FAILED:', err.message); }

try {
  const authRoutes = require('./routes/auth.routes');
  app.use('/api/auth', authRoutes);
  console.log('[Routes] auth.routes loaded');
} catch (err) { console.error('[Routes] auth.routes FAILED:', err.message); }

try {
  const emailRoutes = require('./routes/email.routes');
  app.use('/api/email', emailRoutes);
  console.log('[Routes] email.routes loaded');
} catch (err) { console.error('[Routes] email.routes FAILED:', err.message); }

try {
  const userRoutes = require('./routes/user.routes');
  app.use('/api/user', userRoutes);
  console.log('[Routes] user.routes loaded');
} catch (err) { console.error('[Routes] user.routes FAILED:', err.message); }

try {
  const deviceRoutes = require('./routes/device.routes');
  app.use('/api/device', deviceRoutes);
  console.log('[Routes] device.routes loaded');
} catch (err) { console.error('[Routes] device.routes FAILED:', err.message); }

try {
  const jobberRoutes = require('./routes/jobber.routes');
  app.use('/api/jobber', jobberRoutes);
  console.log('[Routes] jobber.routes loaded');
} catch (err) { console.error('[Routes] jobber.routes FAILED:', err.message); }

// ─── Static files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Blog API routes (new React platform) ────────────────────────────────────
try {
  const blogArticlesRouter = require('./blog-api/articles');
  const blogAuthRouter     = require('./blog-api/blog-auth');
  const blogAiRouter       = require('./blog-api/ai');
  const blogMisc           = require('./blog-api/misc');

  app.use('/api/blog/articles',    blogArticlesRouter);
  app.use('/api/blog/auth',        blogAuthRouter);
  app.use('/api/blog/ai',          blogAiRouter);
  app.use('/api/blog/comments',    blogMisc.commentsRouter);
  app.use('/api/blog/categories',  blogMisc.categoriesRouter);
  app.use('/api/blog/tags',        blogMisc.tagsRouter);
  app.use('/api/blog/authors',     blogMisc.authorsRouter);
  app.use('/api/blog/subscribers', blogMisc.subscribersRouter);
  app.use('/api/blog/analytics',   blogMisc.analyticsRouter);

  // Also keep old blog routes for backwards compat
  try {
    const { sitemapHandler, rssHandler } = require('./blog/seo');
    app.get('/sitemap.xml', sitemapHandler);
    app.get('/rss.xml',     rssHandler);
  } catch (e) { /* optional */ }

  console.log('[Routes] blog-api routes loaded');
} catch (err) { console.error('[Routes] blog-api routes FAILED:', err.message); }

// ─── Serve blog React SPA ─────────────────────────────────────────────────────
app.use('/blog', express.static(path.join(__dirname, '..', 'public', 'blog')));
app.get('/blog/*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'blog', 'index.html'));
});

// ─── Admin HTML ───────────────────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

// ─── 404 for unknown API routes ───────────────────────────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({ success: false, message: 'Internal server error' });
});

// ─── Start + run migrations ───────────────────────────────────────────────────
async function start() {
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
          CREATE INDEX IF NOT EXISTS idx_audit_log_admin    ON admin_audit_log(admin_id);
          CREATE INDEX IF NOT EXISTS idx_audit_log_target   ON admin_audit_log(target_user_id);
          CREATE INDEX IF NOT EXISTS idx_audit_log_created  ON admin_audit_log(created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_sub_history_user   ON subscription_history(user_id);
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
      {
        id: '006_otp_verifications',
        sql: `
          DROP TABLE IF EXISTS otp_verifications;
          CREATE TABLE otp_verifications (
            id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            mobile      VARCHAR(10) NOT NULL,
            otp_hash    TEXT        NOT NULL,
            attempts    INTEGER     DEFAULT 0,
            expires_at  TIMESTAMPTZ NOT NULL,
            used        BOOLEAN     DEFAULT FALSE,
            created_at  TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_otp_verifications_mobile
            ON otp_verifications(mobile);
        `,
      },
      {
        id: '008_users_email_column',
        sql: `
          ALTER TABLE users
            ADD COLUMN IF NOT EXISTS email VARCHAR(255);
          CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
            ON users(email) WHERE email IS NOT NULL;
        `,
      },
      {
        id: '009_email_verifications',
        sql: `
          CREATE TABLE IF NOT EXISTS email_verifications (
            id           SERIAL PRIMARY KEY,
            email        VARCHAR(254)  NOT NULL,
            token        CHAR(64)      NOT NULL UNIQUE,
            redirect_url TEXT          NOT NULL,
            expires_at   TIMESTAMPTZ   NOT NULL,
            verified     BOOLEAN       NOT NULL DEFAULT false,
            verified_at  TIMESTAMPTZ,
            used         BOOLEAN       NOT NULL DEFAULT false,
            used_at      TIMESTAMPTZ,
            created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_email_verifications_email
            ON email_verifications (email);
          CREATE INDEX IF NOT EXISTS idx_email_verifications_token
            ON email_verifications (token);
          CREATE INDEX IF NOT EXISTS idx_email_verifications_expires
            ON email_verifications (expires_at);
        `,
      },
      {
        id: '010_users_profile_columns',
        sql: `
          ALTER TABLE users
            ADD COLUMN IF NOT EXISTS experience    VARCHAR(20),
            ADD COLUMN IF NOT EXISTS trading_style VARCHAR(20),
            ADD COLUMN IF NOT EXISTS referral_code VARCHAR(30);
        `,
      },
      {
        id: '007_email_otps',
        sql: `
          CREATE TABLE IF NOT EXISTS email_otps (
            id         SERIAL      PRIMARY KEY,
            email      VARCHAR(255) NOT NULL,
            otp_hash   VARCHAR(255) NOT NULL,
            purpose    VARCHAR(50)  NOT NULL DEFAULT 'registration',
            expires_at TIMESTAMPTZ  NOT NULL,
            used       BOOLEAN      NOT NULL DEFAULT FALSE,
            attempts   INT          NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_email_otps_email_purpose
            ON email_otps (email, purpose);
          CREATE INDEX IF NOT EXISTS idx_email_otps_expires_at
            ON email_otps (expires_at);
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
        }
      }
      console.log(`Migrations: ${ran} new migration(s) ran.`);
    } finally {
      client.release();
      await pool.end();
    }
  } catch (err) {
    console.error('[Startup] Migration error:', err.message);
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
