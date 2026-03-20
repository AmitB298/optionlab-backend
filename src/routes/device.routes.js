'use strict';
/**
 * routes/device.routes.js [FIXED v2.0]
 *
 * FIXES:
 * 1. Removed require('../services/device.service') — file does not exist
 * 2. OTP logic is now self-contained (DB-based, no external service)
 * 3. Shared pool from ../db/pool — no more standalone new Pool()
 * 4. All validation through ../lib/validate
 */

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const pool    = require('../db/pool');
const V       = require('../lib/validate');
const { otpSendLimiter, otpVerifyLimiter } = require('../lib/rateLimit');

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateOTP() {
  return String(crypto.randomInt(100000, 999999));
}

async function storeOTP(userId, deviceId, otp) {
  const hash      = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  // Remove any existing OTP for this user+device combo
  await pool.query(
    `DELETE FROM device_otp WHERE user_id = $1 AND device_id = $2`,
    [userId, deviceId]
  );

  await pool.query(
    `INSERT INTO device_otp (user_id, device_id, otp_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, deviceId, hash, expiresAt]
  );

  return otp;
}

// ── POST /api/device/send-otp ─────────────────────────────────────────────────
router.post('/send-otp', otpSendLimiter, async (req, res) => {
  const userIdResult   = V.userId(req.body?.userId);
  const deviceIdResult = V.text(req.body?.deviceId, { maxLen: 255, required: true });

  if (!userIdResult.ok)   return res.status(400).json({ error: 'Invalid userId' });
  if (!deviceIdResult.ok) return res.status(400).json({ error: 'Invalid deviceId' });

  try {
    const { rows } = await pool.query(
      `SELECT id, mobile FROM users WHERE id = $1 AND is_active = true`,
      [userIdResult.value]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const otp = await storeOTP(rows[0].id, deviceIdResult.value, generateOTP());

    // TODO: Send OTP via SMS when SMS provider is configured.
    // For now, log it server-side (Railway logs) — replace with SMS call.
    console.log(`[device/send-otp] OTP for user ${rows[0].id} device ${deviceIdResult.value}: ${otp}`);

    return res.json({ success: true, message: 'OTP sent to registered mobile.' });
  } catch (e) {
    console.error('[device/send-otp]', e.message);
    return res.status(500).json({ error: 'Failed to send OTP.' });
  }
});

// ── POST /api/device/verify-otp ───────────────────────────────────────────────
router.post('/verify-otp', otpVerifyLimiter, async (req, res) => {
  const userIdResult   = V.userId(req.body?.userId);
  const deviceIdResult = V.text(req.body?.deviceId, { maxLen: 255, required: true });
  const otpResult      = V.otp(req.body?.otp);

  if (!userIdResult.ok)   return res.status(400).json({ error: 'Invalid userId' });
  if (!deviceIdResult.ok) return res.status(400).json({ error: 'Invalid deviceId' });
  if (!otpResult.ok)      return res.status(400).json({ error: 'otp must be 6 digits' });

  try {
    const { rows } = await pool.query(
      `SELECT * FROM device_otp
       WHERE user_id = $1 AND device_id = $2 AND used = false AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userIdResult.value, deviceIdResult.value]
    );

    if (!rows.length) {
      return res.status(400).json({ error: 'OTP expired or not found. Request a new one.' });
    }

    const record = rows[0];

    // Increment attempt counter
    await pool.query(
      `UPDATE device_otp SET attempts = attempts + 1 WHERE id = $1`,
      [record.id]
    );

    if (record.attempts >= 5) {
      return res.status(429).json({ error: 'Too many attempts. Request a new OTP.' });
    }

    const valid = await bcrypt.compare(otpResult.value, record.otp_hash);
    if (!valid) {
      return res.status(400).json({ error: 'Invalid OTP.' });
    }

    // Mark OTP as used
    await pool.query(`UPDATE device_otp SET used = true WHERE id = $1`, [record.id]);

    // Trust this device
    await pool.query(
      `INSERT INTO trusted_devices (user_id, device_id, device_hash, is_trusted, verified_at, last_seen_at)
       VALUES ($1, $2, $3, true, NOW(), NOW())
       ON CONFLICT (user_id, device_id) DO UPDATE
         SET is_trusted = true, verified_at = NOW(), last_seen_at = NOW()`,
      [userIdResult.value, deviceIdResult.value, deviceIdResult.value]
    );

    return res.json({ success: true, message: 'Device verified and trusted.' });
  } catch (e) {
    console.error('[device/verify-otp]', e.message);
    return res.status(500).json({ error: 'Verification failed.' });
  }
});

module.exports = router;
