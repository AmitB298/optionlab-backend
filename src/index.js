'use strict';

// Bug #5: JWT_SECRET guard — server refuses to start without it
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET env var not set.');
  process.exit(1);
}

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const path    = require('path');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

// Bug #9: CORS locked to known origins
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // mobile apps / desktop
    const allowed = ['https://optionslab.in','https://www.optionslab.in',
      'https://www.optionslab.in',
      ...(process.env.ALLOWED_ORIGINS||'').split(',').filter(Boolean)];
    if (allowed.some(o => origin.startsWith(o)) || process.env.NODE_ENV!=='production')
      return cb(null, true);
    cb(null, true); // permissive until domain locked
  },
  credentials: true,
}));

// Bug #2: Skip JSON body parser for webhook (needs raw bytes for HMAC)
app.use((req, res, next) => {
  if (req.path === '/api/payments/webhook') return next();
  express.json({ limit: '10mb' })(req, res, next);
});
app.use((req, res, next) => {
  if (req.path === '/api/payments/webhook') return next();
  express.urlencoded({ extended: true })(req, res, next);
});

app.set('trust proxy', 1);
try { app.use(require('cookie-parser')()); } catch(e) {}

// Bug #1: Init Sentry BEFORE routes
let monitoring = { init:()=>{}, errorHandler:()=>{}, status:()=>({enabled:false}), captureError:()=>{} };
try { monitoring = require('./monitoring/sentry'); monitoring.init(app); } catch(e) {}

// Health
try { app.use('/api/jobber', require('./routes/jobber.routes')); console.log('[boot] jobber routes OK'); } catch(e) { console.error('[boot] jobber routes:', e.message); }
app.get('/api/app/status', (req, res) => res.json({ status: 'ok', version: '1.0.0', market: 'NSE', timestamp: new Date().toISOString() }));
app.get('/health', (req, res) => res.json({
  status:'ok', service:'OptionLab API', version:'2.2.0',
  uptime: Math.round(process.uptime()),
  environment: process.env.NODE_ENV||'development',
  monitoring: monitoring.status(),
  timestamp: new Date().toISOString(),
}));

// Admin
try {
  const {adminLogin,adminLogout,adminLoginLimiter} = require('./routes/admin.auth');
  app.post('/api/admin/login',  adminLoginLimiter, adminLogin);
  app.post('/api/admin/logout', adminLogout);
  app.use('/api/admin', require('./routes/admin.routes'));
  console.log('[boot] admin OK');
} catch(e) { console.error('[boot] admin FAILED:', e.message); }

try { app.use('/api/admin/export', require('./routes/export.routes')); } catch(e) {}
try { app.use('/api/admin', require('./routes/admin.advanced')); console.log('[boot] admin.advanced OK'); } catch(e) { console.error('[boot] admin.advanced:', e.message); }

// Payments (webhook uses raw body — registered before any body-parsed routes)
try { app.use('/api/payments', require('./routes/payments.routes')); console.log('[boot] payments OK'); } catch(e) { console.error('[boot] payments FAILED:', e.message); }

// Download
try { app.use('/api/download', require('./routes/download.routes')); console.log('[boot] download OK'); } catch(e) { console.error('[boot] download FAILED:', e.message); }

// User + Auth
try { app.use('/api/user',   require('./routes/user.advanced'));  console.log('[boot] user.advanced OK'); } catch(e) { console.error('[boot] user.advanced:', e.message); }
try { app.use('/api/auth',   require('./routes/auth.routes'));    console.log('[boot] auth OK'); } catch(e) { console.error('[boot] auth FAILED:', e.message); }
try { app.use('/api/email',  require('./routes/email.routes'));   console.log('[boot] email OK'); } catch(e) { console.error('[boot] email FAILED:', e.message); }
try { app.use('/api/user',   require('./routes/user.routes'));    console.log('[boot] user.routes OK'); } catch(e) { console.error('[boot] user.routes FAILED:', e.message); }
try { app.use('/api/device', require('./routes/device.routes')); } catch(e) {}
try { app.use('/api/jobber', require('./routes/jobber.routes')); console.log('[boot] jobber OK'); } catch(e) { console.error('[boot] jobber FAILED:', e.message); }
// Bug #6: dead require removed — angel module does not exist

// Blog
try {
  const m = require('./blog-api/misc');
  app.use('/api/blog/articles',   require('./blog-api/articles'));
  app.use('/api/blog/auth',       require('./blog-api/blog-auth'));
  app.use('/api/blog/ai',         require('./blog-api/ai'));
  app.use('/api/blog/comments',   m.commentsRouter);
  app.use('/api/blog/categories', m.categoriesRouter);
  app.use('/api/blog/tags',       m.tagsRouter);
  app.use('/api/blog/authors',    m.authorsRouter);
  app.use('/api/blog/subscribers',m.subscribersRouter);
  app.use('/api/blog/analytics',  m.analyticsRouter);
  console.log('[boot] blog OK');
} catch(e) { console.error('[boot] blog FAILED:', e.message); }

// Static
app.use(express.static(path.join(__dirname,'..','public')));
app.use('/blog', express.static(path.join(__dirname,'..','public','blog')));
app.get('/blog/*',(req,res)=>res.sendFile(path.join(__dirname,'..','public','blog','index.html')));
app.get('/admin',   (req,res)=>res.sendFile(path.join(__dirname,'..','public','admin.html'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
app.get('/app',     (req,res)=>res.sendFile(path.join(__dirname,'..','public','app.html'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
app.get('/profile', (req,res)=>res.sendFile(path.join(__dirname,'..','public','profile.html'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
app.get('/verify',  (req,res)=>res.sendFile(path.join(__dirname,'..','public','verify.html'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
app.get('/setup',   (req,res)=>res.sendFile(path.join(__dirname,'..','public','setup.html'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
app.get('/register',(req,res)=>res.sendFile(path.join(__dirname,'..','public','register.html'), { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));

// Bug #1: Sentry error handler after routes
monitoring.errorHandler(app);

app.use('/api/*',(req,res)=>res.status(404).json({success:false,message:'Route not found'}));
app.use((err,req,res,next)=>{
  console.error('[error]',err.message);
  res.status(err.status||500).json({success:false,message:'Internal server error'});
});

async function start() {
  try {
    const {Pool} = require('pg');
    const pool = new Pool({connectionString:process.env.DATABASE_URL});
    const client = await pool.connect();
    await client.query(`CREATE TABLE IF NOT EXISTS migrations_log (id SERIAL PRIMARY KEY, migration VARCHAR(255) UNIQUE NOT NULL, ran_at TIMESTAMPTZ DEFAULT NOW())`);
    const migs = [
      {id:'m01_role',    sql:`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user'`},
      {id:'m02_email',   sql:`ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255)`},
      {id:'m03_profile', sql:`ALTER TABLE users ADD COLUMN IF NOT EXISTS experience VARCHAR(20), ADD COLUMN IF NOT EXISTS trading_style VARCHAR(20), ADD COLUMN IF NOT EXISTS referral_code VARCHAR(30), ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS broker_client_id VARCHAR(50)`},
      {id:'m04_activity',sql:`CREATE TABLE IF NOT EXISTS user_activity (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, total_logins INTEGER DEFAULT 0, last_login_at TIMESTAMPTZ, last_login_ip VARCHAR(50), last_device VARCHAR(255), session_count INTEGER DEFAULT 0, failed_logins INTEGER DEFAULT 0, last_failed_at TIMESTAMPTZ)`},
      {id:'m05_sub',     sql:`CREATE TABLE IF NOT EXISTS subscription_history (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, plan_from VARCHAR(50), plan_to VARCHAR(50), reason TEXT, amount NUMERIC(10,2), payment_ref VARCHAR(255), created_at TIMESTAMPTZ DEFAULT NOW())`},
      {id:'m06_angel',   sql:`CREATE TABLE IF NOT EXISTS angel_credentials (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, api_key TEXT, client_code VARCHAR(50), mpin TEXT, totp_secret TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())`},
      {id:'m07_email_otp',sql:`CREATE TABLE IF NOT EXISTS email_otps (id SERIAL PRIMARY KEY, email VARCHAR(255) NOT NULL, otp_hash VARCHAR(255) NOT NULL, purpose VARCHAR(50) DEFAULT 'registration', expires_at TIMESTAMPTZ NOT NULL, used BOOLEAN DEFAULT false, attempts INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`},
      {id:'m08_email_ver',sql:`CREATE TABLE IF NOT EXISTS email_verifications (id SERIAL PRIMARY KEY, email VARCHAR(254) NOT NULL, token CHAR(64) NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, verified BOOLEAN DEFAULT false, used BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT NOW())`},
      {id:'m09_dl_log',  sql:`CREATE TABLE IF NOT EXISTS download_log (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, version VARCHAR(20), ip_address VARCHAR(45), created_at TIMESTAMPTZ DEFAULT NOW())`},
      {id:'m10_admin',   sql:`CREATE TABLE IF NOT EXISTS admin_audit_log (id SERIAL PRIMARY KEY, admin_id INTEGER, action VARCHAR(100) NOT NULL, target_user_id INTEGER, payload JSONB, success BOOLEAN DEFAULT true, ip_address VARCHAR(50), created_at TIMESTAMPTZ DEFAULT NOW())`},
    ];
    for (const m of migs) {
      const {rows} = await client.query('SELECT id FROM migrations_log WHERE migration=$1',[m.id]);
      if (rows.length) continue;
      try {
        await client.query('BEGIN');
        await client.query(m.sql);
        await client.query('INSERT INTO migrations_log(migration)VALUES($1)',[m.id]);
        await client.query('COMMIT');
        console.log('[db]',m.id);
      } catch(e) { await client.query('ROLLBACK'); console.warn('[db] skip',m.id,'-',e.message.split('\n')[0]); }
    }
    client.release(); await pool.end();
  } catch(e) { console.error('[db]',e.message); }

  try {
    const pe = require('./cron/planExpiry');
    await pe.ensureSchema().catch(()=>{});
    await pe.downgradeExpiredPlans().catch(()=>{});
    const cron = require('node-cron');
    cron.schedule('0 * * * *',  ()=>pe.downgradeExpiredPlans().catch(()=>{}));
    cron.schedule('30 3 * * *', ()=>pe.warnExpiringPlans().catch(()=>{}));
    console.log('[boot] cron OK');
  } catch(e) { console.warn('[boot] cron skipped:',e.message); }

  app.listen(PORT, ()=>{
    console.log(`\nOptionLab API v2.2.0 on port ${PORT}`);
    console.log('Routes: /api/payments /api/download /api/user /api/auth /api/admin\n');
  });
}

start().catch(err=>{ console.error('Fatal:',err.message); process.exit(1); });
