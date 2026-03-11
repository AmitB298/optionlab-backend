// src/routes/angel.routes.js
const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');
const { Pool } = require('pg');
const fs      = require('fs');
const path    = require('path');

const pool       = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET || 'optionlab-secret-2024';
const ENV_PATH   = path.resolve(__dirname, '../../.env');

// ── Auth middleware ────────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ success: false, message: 'No token' });
  try {
    const token   = header.replace('Bearer ', '');
    req.user      = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

// ── Helper: update a single key in .env file ──────────────────────────────────
function updateEnvFile(updates) {
  try {
    let content = '';
    try { content = fs.readFileSync(ENV_PATH, 'utf8'); } catch { content = ''; }

    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      const line  = `${key}=${value}`;
      if (regex.test(content)) {
        content = content.replace(regex, line);
      } else {
        content = content.trimEnd() + `\n${line}\n`;
      }
    }

    fs.writeFileSync(ENV_PATH, content, 'utf8');
    return true;
  } catch (err) {
    console.error('⚠️  Could not write .env:', err.message);
    return false;
  }
}

// ── GET /api/angel/credentials ────────────────────────────────────────────────
// Returns stored credentials for the logged-in user (secrets masked)
router.get('/credentials', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT api_key, client_code, mpin, totp_secret, updated_at FROM angel_credentials WHERE user_id=$1',
      [req.user.id]
    );

    if (!result.rows.length) {
      return res.json({ success: true, data: null, message: 'No credentials saved yet' });
    }

    const row = result.rows[0];
    // Mask secrets — only show first 4 chars + ***
    const mask = (v) => v ? v.slice(0, 4) + '***' : '';

    return res.json({
      success: true,
      data: {
        api_key:     mask(row.api_key),
        client_code: row.client_code,          // client_code is not secret
        mpin:        row.mpin ? '****' : '',   // never expose MPIN
        totp_secret: mask(row.totp_secret),
        updated_at:  row.updated_at,
        isConfigured: !!(row.api_key && row.client_code && row.mpin && row.totp_secret),
      }
    });
  } catch (err) {
    console.error('GET credentials error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── POST /api/angel/credentials ───────────────────────────────────────────────
// Save/update Angel One credentials — writes to DB + .env
router.post('/credentials', authMiddleware, async (req, res) => {
  const { api_key, mpin, totp_secret } = req.body;

  // Validate what was provided
  if (mpin !== undefined && !/^\d{4}$/.test(mpin)) {
    return res.status(400).json({ success: false, message: 'MPIN must be exactly 4 digits' });
  }
  if (!api_key && !mpin && !totp_secret) {
    return res.status(400).json({ success: false, message: 'Provide at least one field to update' });
  }

  try {
    // 1. Get user's client_code from users table (locked — never changes)
    const userRes = await pool.query(
      'SELECT angel_one_client_id FROM users WHERE id=$1',
      [req.user.id]
    );
    const client_code = userRes.rows[0]?.angel_one_client_id || '';

    // 2. Upsert into angel_credentials
    await pool.query(`
      INSERT INTO angel_credentials (user_id, api_key, client_code, mpin, totp_secret, updated_at)
      VALUES ($1,
        COALESCE(NULLIF($2,''), (SELECT api_key FROM angel_credentials WHERE user_id=$1)),
        $3,
        COALESCE(NULLIF($4,''), (SELECT mpin FROM angel_credentials WHERE user_id=$1)),
        COALESCE(NULLIF($5,''), (SELECT totp_secret FROM angel_credentials WHERE user_id=$1)),
        NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        api_key     = COALESCE(NULLIF(EXCLUDED.api_key,''),     angel_credentials.api_key),
        client_code = EXCLUDED.client_code,
        mpin        = COALESCE(NULLIF(EXCLUDED.mpin,''),        angel_credentials.mpin),
        totp_secret = COALESCE(NULLIF(EXCLUDED.totp_secret,''), angel_credentials.totp_secret),
        updated_at  = NOW()
    `, [req.user.id, api_key || '', client_code, mpin || '', totp_secret || '']);

    // 3. Read back the full (unmasked) row to sync .env
    const saved = await pool.query(
      'SELECT api_key, client_code, mpin, totp_secret FROM angel_credentials WHERE user_id=$1',
      [req.user.id]
    );
    const row = saved.rows[0];

    // 4. Update .env file so angelone.service.ts picks it up on next restart
    const envUpdated = updateEnvFile({
      ANGEL_API_KEY:     row.api_key,
      ANGEL_CLIENT_CODE: row.client_code,
      ANGEL_MPIN:        row.mpin,
      ANGEL_TOTP_SECRET: row.totp_secret,
    });

    return res.json({
      success: true,
      message: `Credentials saved to database${envUpdated ? ' and .env' : ' (DB only — .env write failed)'}`,
      envUpdated,
    });
  } catch (err) {
    console.error('POST credentials error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── DELETE /api/angel/credentials ────────────────────────────────────────────
router.delete('/credentials', authMiddleware, async (req, res) => {
  try {
    await pool.query('DELETE FROM angel_credentials WHERE user_id=$1', [req.user.id]);
    updateEnvFile({
      ANGEL_API_KEY: '', ANGEL_CLIENT_CODE: '',
      ANGEL_MPIN: '', ANGEL_TOTP_SECRET: '',
    });
    return res.json({ success: true, message: 'Credentials cleared' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
