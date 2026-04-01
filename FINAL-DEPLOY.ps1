# ============================================================================
#  OptionsLab — FINAL FIX
#  Replaces index.js with bulletproof version and deploys
# ============================================================================
Set-Location "E:\OptionLab\optionlab-backend"

Write-Host ""
Write-Host "  Writing bulletproof index.js..." -ForegroundColor Cyan

# Write the new index.js directly - no top-level requires that can crash
$newIndex = @'
'use strict';
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const path         = require('path');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);

try { app.use(require('cookie-parser')()); } catch(e) {}

// Health
app.get('/health', (req, res) => res.json({
  status: 'ok', service: 'OptionLab API', version: '2.1.0',
  uptime: Math.round(process.uptime()),
  environment: process.env.NODE_ENV || 'development',
  timestamp: new Date().toISOString()
}));

// Admin
try {
  const { adminLogin, adminLogout, adminLoginLimiter } = require('./routes/admin.auth');
  app.post('/api/admin/login',  adminLoginLimiter, adminLogin);
  app.post('/api/admin/logout', adminLogout);
  app.use('/api/admin', require('./routes/admin.routes'));
  console.log('[boot] admin OK');
} catch(e) { console.error('[boot] admin FAILED:', e.message); }

try { app.use('/api/admin/export', require('./routes/export.routes')); } catch(e) {}
try { app.use('/api/admin', require('./routes/admin.advanced')); console.log('[boot] admin.advanced OK'); } catch(e) { console.error('[boot] admin.advanced:', e.message); }

// NEW ROUTES — each isolated
try { app.use('/api/payments', require('./routes/payments.routes')); console.log('[boot] payments OK'); } catch(e) { console.error('[boot] payments FAILED:', e.message); }
try { app.use('/api/download', require('./routes/download.routes')); console.log('[boot] download OK'); } catch(e) { console.error('[boot] download FAILED:', e.message); }
try { app.use('/api/user',     require('./routes/user.advanced'));   console.log('[boot] user.advanced OK'); } catch(e) { console.error('[boot] user.advanced FAILED:', e.message); }
try { app.use('/api/auth',     require('./routes/auth.routes'));     console.log('[boot] auth OK'); } catch(e) { console.error('[boot] auth FAILED:', e.message); }
try { app.use('/api/email',    require('./routes/email.routes'));    console.log('[boot] email OK'); } catch(e) { console.error('[boot] email FAILED:', e.message); }
try { app.use('/api/user',     require('./routes/user.routes'));     console.log('[boot] user.routes OK'); } catch(e) { console.error('[boot] user.routes FAILED:', e.message); }
try { app.use('/api/device',   require('./routes/device.routes'));   } catch(e) {}
try { app.use('/api/jobber',   require('./routes/jobber.routes'));   console.log('[boot] jobber OK'); } catch(e) { console.error('[boot] jobber FAILED:', e.message); }

// Blog
try {
  const blogMisc = require('./blog-api/misc');
  app.use('/api/blog/articles',    require('./blog-api/articles'));
  app.use('/api/blog/auth',        require('./blog-api/blog-auth'));
  app.use('/api/blog/ai',          require('./blog-api/ai'));
  app.use('/api/blog/comments',    blogMisc.commentsRouter);
  app.use('/api/blog/categories',  blogMisc.categoriesRouter);
  app.use('/api/blog/tags',        blogMisc.tagsRouter);
  app.use('/api/blog/authors',     blogMisc.authorsRouter);
  app.use('/api/blog/subscribers', blogMisc.subscribersRouter);
  app.use('/api/blog/analytics',   blogMisc.analyticsRouter);
  console.log('[boot] blog OK');
} catch(e) { console.error('[boot] blog FAILED:', e.message); }

// Static + SPA
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/blog', express.static(path.join(__dirname, '..', 'public', 'blog')));
app.get('/blog/*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'blog', 'index.html')));
app.get('/admin',  (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));
app.get('/app',    (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'app.html')));

// 404 + errors
app.use('/api/*', (req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use((err, req, res, next) => res.status(err.status || 500).json({ success: false, message: 'Internal server error' }));

async function start() {
  try {
    const { Pool } = require('pg');
    const pool   = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    await client.query(`CREATE TABLE IF NOT EXISTS migrations_log (id SERIAL PRIMARY KEY, migration VARCHAR(255) UNIQUE NOT NULL, ran_at TIMESTAMPTZ DEFAULT NOW())`);
    const migs = [
      { id: 'm01', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user'` },
      { id: 'm02', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)` },
      { id: 'm03', sql: `ALTER TABLE users ADD COLUMN IF NOT EXISTS experience VARCHAR(20), ADD COLUMN IF NOT EXISTS trading_style VARCHAR(20), ADD COLUMN IF NOT EXISTS referral_code VARCHAR(30), ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS broker_client_id VARCHAR(50)` },
      { id: 'm04', sql: `CREATE TABLE IF NOT EXISTS user_activity (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, total_logins INTEGER DEFAULT 0, last_login_at TIMESTAMPTZ, last_login_ip VARCHAR(50), last_device VARCHAR(255), session_count INTEGER DEFAULT 0, failed_logins INTEGER DEFAULT 0, last_failed_at TIMESTAMPTZ)` },
      { id: 'm05', sql: `CREATE TABLE IF NOT EXISTS subscription_history (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, plan_from VARCHAR(50), plan_to VARCHAR(50), reason TEXT, amount NUMERIC(10,2), payment_ref VARCHAR(255), created_at TIMESTAMPTZ DEFAULT NOW())` },
      { id: 'm06', sql: `CREATE TABLE IF NOT EXISTS angel_credentials (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, api_key TEXT, client_code VARCHAR(50), mpin TEXT, totp_secret TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())` },
      { id: 'm07', sql: `CREATE TABLE IF NOT EXISTS download_log (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, version VARCHAR(20), ip_address VARCHAR(45), created_at TIMESTAMPTZ DEFAULT NOW())` },
    ];
    for (const m of migs) {
      const { rows } = await client.query('SELECT id FROM migrations_log WHERE migration = $1', [m.id]);
      if (rows.length) continue;
      try { await client.query('BEGIN'); await client.query(m.sql); await client.query('INSERT INTO migrations_log (migration) VALUES ($1)', [m.id]); await client.query('COMMIT'); console.log('[db]', m.id); }
      catch(e) { await client.query('ROLLBACK'); console.warn('[db] skip', m.id, e.message.split('\n')[0]); }
    }
    client.release(); await pool.end();
  } catch(e) { console.error('[db]', e.message); }

  try {
    const planExpiry = require('./cron/planExpiry');
    await planExpiry.ensureSchema().catch(()=>{});
    await planExpiry.downgradeExpiredPlans().catch(()=>{});
    require('node-cron').schedule('0 * * * *', () => planExpiry.downgradeExpiredPlans().catch(()=>{}));
    console.log('[boot] cron OK');
  } catch(e) { console.warn('[boot] cron skipped:', e.message); }

  app.listen(PORT, () => {
    console.log(`\nOptionLab API v2.1.0 on port ${PORT}`);
    console.log('Routes: /api/payments /api/download /api/user /api/auth /api/admin\n');
  });
}
start().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
'@

Set-Content "src\index.js" $newIndex -Encoding UTF8
Write-Host "  ✓ index.js written" -ForegroundColor Green

# Verify key strings are present
$content = Get-Content "src\index.js" -Raw
$ok = $content -like "*payments.routes*" -and $content -like "*download.routes*" -and $content -like "*v2.1.0*"
if ($ok) {
    Write-Host "  ✓ Verified: payments + download + v2.1.0 all present" -ForegroundColor Green
} else {
    Write-Host "  ✗ Verification failed" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  Deploying..." -ForegroundColor Cyan
railway up --detach

Write-Host ""
Write-Host "  Waiting 3 minutes for build..." -ForegroundColor Gray

$live = $false
for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep 15
    try {
        $r = Invoke-RestMethod "https://web-production-8a8e1.up.railway.app/api/payments/pricing" -TimeoutSec 8
        if ($r.plans) {
            Write-Host ""
            Write-Host "  ✅ LIVE! /api/payments/pricing → $($r.plans.Count) plans" -ForegroundColor Green
            Write-Host "  ✅ DEPLOYMENT COMPLETE" -ForegroundColor Green
            $live = $true
            break
        }
    } catch { Write-Host "  ⏳ $([int](($i+1)*15))s..." -ForegroundColor DarkGray }
}

if (-not $live) {
    Write-Host ""
    Write-Host "  Still not live. Check logs:" -ForegroundColor Yellow
    Write-Host "  railway logs 2>&1 | Select-Object -Last 20" -ForegroundColor Gray
}

Write-Host ""
Read-Host "Press Enter to close"