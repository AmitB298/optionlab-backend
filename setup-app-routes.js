/**
 * setup-app-routes.js
 *
 * Run: node setup-app-routes.js
 *
 * 1. Creates src/routes/app.routes.js  — safe heartbeat endpoint
 * 2. Patches src/index.js              — mounts /api/app and removes angel route
 * 3. Creates DB migration              — adds app_sessions table
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── 1. Write app.routes.js ───────────────────────────────────────────────────
const appRoutes = `'use strict';

/**
 * app.routes.js
 *
 * Safe endpoints for the Jobber desktop app.
 * NO broker credentials ever touch this server.
 *
 * Jobber app calls:
 *   POST /api/app/heartbeat   — "I am alive" ping every 2 min
 *   GET  /api/app/status      — app checks its own session info
 */

const express  = require('express');
const router   = express.Router();
const jwt      = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const pool       = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET || 'optionlab_secret';

// ── JWT auth middleware ────────────────────────────────────────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// ── POST /api/app/heartbeat ───────────────────────────────────────────────────
// Called by Jobber every 2 minutes while running.
// Accepts ONLY: appVersion, platform, isMarketConnected
// NEVER stores: api_key, mpin, totp_secret, client_code or any broker data
router.post('/heartbeat', auth, async (req, res) => {
  try {
    const { appVersion, platform, isMarketConnected } = req.body;
    const userId = req.user.id;
    const ip     = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || null;

    // Upsert into app_sessions — one row per user, updated on each heartbeat
    await pool.query(
      \`INSERT INTO app_sessions (user_id, app_version, platform, is_market_connected, last_seen_at, ip_address)
       VALUES ($1, $2, $3, $4, NOW(), $5)
       ON CONFLICT (user_id) DO UPDATE SET
         app_version          = EXCLUDED.app_version,
         platform             = EXCLUDED.platform,
         is_market_connected  = EXCLUDED.is_market_connected,
         last_seen_at         = NOW(),
         ip_address           = EXCLUDED.ip_address\`,
      [userId, appVersion || null, platform || null, isMarketConnected || false, ip]
    );

    // Also update users.last_login_at
    await pool.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [userId]
    ).catch(() => {});

    return res.json({ success: true, message: 'ok' });
  } catch (err) {
    console.error('[heartbeat]', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET /api/app/status ───────────────────────────────────────────────────────
// App checks its own session and gets any admin announcements
router.get('/status', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [userRes, sessionRes, announcementsRes] = await Promise.all([
      pool.query('SELECT id, name, mobile, plan, is_active FROM users WHERE id = $1', [userId]),
      pool.query('SELECT app_version, platform, is_market_connected, last_seen_at FROM app_sessions WHERE user_id = $1', [userId]),
      pool.query(
        \`SELECT id, title, body, type, created_at FROM announcements
         WHERE is_active = true
           AND (expires_at IS NULL OR expires_at > NOW())
           AND (target = 'all'
                OR (target = 'paid'  AND $1 = 'PAID')
                OR (target = 'free'  AND $1 = 'FREE')
                OR (target = 'trial' AND $1 = 'TRIAL'))
         ORDER BY created_at DESC LIMIT 5\`,
        [req.user.plan]
      ).catch(() => ({ rows: [] })),
    ]);

    if (!userRes.rows.length) return res.status(404).json({ success: false, message: 'User not found' });

    const user = userRes.rows[0];
    if (!user.is_active) return res.status(403).json({ success: false, message: 'Account deactivated' });

    return res.json({
      success: true,
      user: { id: user.id, name: user.name, mobile: user.mobile, plan: user.plan },
      session: sessionRes.rows[0] || null,
      announcements: announcementsRes.rows,
    });
  } catch (err) {
    console.error('[app/status]', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
`;

fs.writeFileSync(path.join(__dirname, 'src', 'routes', 'app.routes.js'), appRoutes, 'utf8');
console.log('✓ Created src/routes/app.routes.js');

// ─── 2. Create DB migration script ───────────────────────────────────────────
const migration = `'use strict';
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  try {
    // Create app_sessions table
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
    console.log('✓ app_sessions table ready');

    // Add last_login_at to users if missing
    await pool.query(\`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ
    \`);
    console.log('✓ users.last_login_at column ready');

    // Add total_logins to users if missing
    await pool.query(\`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS total_logins INTEGER DEFAULT 0
    \`);
    console.log('✓ users.total_logins column ready');

    console.log('\\n✅ Migration complete');
  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
`;

fs.writeFileSync(path.join(__dirname, 'scripts', 'migrate-app-sessions.js'), migration, 'utf8');
console.log('✓ Created scripts/migrate-app-sessions.js');

// ─── 3. Patch index.js ────────────────────────────────────────────────────────
const indexPath = path.join(__dirname, 'src', 'index.js');
let index = fs.readFileSync(indexPath, 'utf8');

// Check if already patched
if (index.includes('app.routes')) {
  console.log('✓ index.js already has app routes — skipping patch');
} else {
  // Find the angel routes block and replace/add after it
  const angelBlock = /\/\/ Angel One routes[\s\S]*?app\.use\('\/api\/angel'[\s\S]*?\}\s*\n/m;

  const newBlock = `// App heartbeat routes (safe — no broker credentials)
try {
  const appRoutes = require('./routes/app.routes');
  app.use('/api/app', appRoutes);
  console.log('✓ App routes mounted at /api/app');
} catch (e) {
  console.warn('⚠ App routes failed to load:', e.message);
}

`;

  if (angelBlock.test(index)) {
    index = index.replace(angelBlock, newBlock);
    console.log('✓ Replaced angel routes with app routes in index.js');
  } else {
    // Just append before the 404 handler
    const notFound = `// ─── 404 for unknown API routes`;
    index = index.replace(notFound, newBlock + notFound);
    console.log('✓ Injected app routes into index.js');
  }

  fs.writeFileSync(indexPath, index, 'utf8');
}

// ─── 4. Verify ───────────────────────────────────────────────────────────────
console.log('\n─── Verification ───────────────────────────────');
try {
  require('./src/routes/app.routes.js');
  console.log('✓ app.routes.js loads without errors');
} catch (e) {
  console.log('✗ app.routes.js load error:', e.message);
}

const finalIndex = fs.readFileSync(indexPath, 'utf8');
console.log('✓ /api/app in index.js:', finalIndex.includes('/api/app'));
console.log('✓ app.routes require in index.js:', finalIndex.includes('app.routes'));

console.log('\n─── Next steps ─────────────────────────────────');
console.log('1. node scripts/migrate-app-sessions.js   (run DB migration)');
console.log('2. git add -A && git commit -m "feat: add safe app heartbeat routes" && git push');
console.log('3. Update admin dashboard to show live users from app_sessions');