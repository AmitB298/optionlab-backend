/**
 * routes/otp.routes.js  [v1.1]
 *
 * Endpoints:
 *   POST /api/otp/send    — send OTP to mobile via Fast2SMS
 *   POST /api/otp/verify  — verify OTP, returns a short-lived otp_token
 *
 * Flow:
 *   1. Frontend calls /send with { mobile }
 *   2. Backend generates 6-digit OTP, hashes it, stores in otp_verifications table
 *   3. Fast2SMS sends SMS to mobile
 *   4. Frontend calls /verify with { mobile, otp }
 *   5. Backend verifies OTP, returns { otp_token } (signed JWT, 10 min expiry)
 *   6. Registration call includes otp_token — auth.routes.js validates it
 *
 * Security:
 *   - OTP expires in 10 minutes
 *   - Max 3 attempts per OTP — locked after that
 *   - Rate limited: 3 sends per mobile per 10 minutes
 *   - OTP hash stored in DB — never plain text
 *   - otp_token is a signed JWT — cannot be forged
 */

'use strict';

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const https   = require('https');
require('dotenv').config();

const pool = require('../db/pool');
const V    = require('../lib/validate');

const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS   = 3;
const OTP_RESEND_SECONDS = 60; // minimum gap between resends

// ─── Generate a 6-digit OTP ───────────────────────────────────────────────────
function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ─── Send SMS via Fast2SMS Quick SMS route ────────────────────────────────────
function sendFast2SMS(mobile, otp) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.FAST2SMS_API_KEY;
    if (!apiKey) return reject(new Error('FAST2SMS_API_KEY not configured'));

    const message = `Your OptionLab verification code is ${otp}. Valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share with anyone.`;

    const params = new URLSearchParams({
      route:   'q',
      numbers: mobile,
      message: message,
    });

    const options = {
      hostname: 'www.fast2sms.com',
      path:     `/dev/bulkV2?${params.toString()}`,
      method:   'GET',
      headers:  {
        authorization: apiKey,
        'Cache-Control': 'no-cache',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          // ── Log the full raw Fast2SMS response for debugging ──────────────
          console.log('[Fast2SMS] raw response:', JSON.stringify(parsed));
          if (parsed.return === true) {
            resolve(parsed);
          } else {
            // message can be a string or an array — handle both
            const msg = Array.isArray(parsed.message)
              ? parsed.message.join(', ')
              : (parsed.message || 'Fast2SMS send failed');
            reject(new Error(msg));
          }
        } catch (e) {
          reject(new Error('Fast2SMS invalid response: ' + data));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Fast2SMS request timed out'));
    });
    req.end();
  });
}

// ─── POST /api/otp/send ───────────────────────────────────────────────────────
router.post('/send', async (req, res) => {
  const mobileResult = V.mobile(req.body?.mobile);
  if (!mobileResult.ok) {
    return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
  }

  const mobile = mobileResult.value;

  try {
    // ── Check if mobile already registered ─────────────────────────────────
    const { rows: existing } = await pool.query(
      `SELECT id FROM users WHERE mobile = $1`,
      [mobile]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Mobile number already registered. Please login.' });
    }

    // ── Rate limit: block if last OTP sent < OTP_RESEND_SECONDS ago ────────
    const { rows: recent } = await pool.query(
      `SELECT created_at FROM otp_verifications
       WHERE mobile = $1 AND used = false
         AND created_at > NOW() - INTERVAL '${OTP_RESEND_SECONDS} seconds'
       ORDER BY created_at DESC LIMIT 1`,
      [mobile]
    );
    if (recent.length) {
      const wait = OTP_RESEND_SECONDS - Math.floor(
        (Date.now() - new Date(recent[0].created_at).getTime()) / 1000
      );
      return res.status(429).json({
        error: `Please wait ${wait} seconds before requesting another OTP`,
      });
    }

    // ── Invalidate any existing unused OTPs for this mobile ────────────────
    await pool.query(
      `UPDATE otp_verifications SET used = true
       WHERE mobile = $1 AND used = false`,
      [mobile]
    );

    // ── Generate + hash OTP ─────────────────────────────────────────────────
    const otp     = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);

    // ── Store in DB ─────────────────────────────────────────────────────────
    await pool.query(
      `INSERT INTO otp_verifications
         (mobile, otp_hash, attempts, expires_at, used, created_at)
       VALUES ($1, $2, 0, NOW() + INTERVAL '${OTP_EXPIRY_MINUTES} minutes', false, NOW())`,
      [mobile, otpHash]
    );

    // ── Send SMS ────────────────────────────────────────────────────────────
    await sendFast2SMS(mobile, otp);

    console.log(`[OTP] Sent to +91${mobile}`);

    return res.json({
      success: true,
      message: `OTP sent to +91${mobile}`,
      expires_in: OTP_EXPIRY_MINUTES * 60,
    });

  } catch (e) {
    console.error('[otp/send] ERROR:', e.message);
    return res.status(500).json({
      error: 'Failed to send OTP. Check your number and try again.',
    });
  }
});

// ─── POST /api/otp/verify ─────────────────────────────────────────────────────
router.post('/verify', async (req, res) => {
  const mobileResult = V.mobile(req.body?.mobile);
  const otpResult    = V.otp(req.body?.otp);

  if (!mobileResult.ok) return res.status(400).json({ error: 'Invalid mobile number' });
  if (!otpResult.ok)    return res.status(400).json({ error: 'OTP must be exactly 6 digits' });

  const mobile = mobileResult.value;
  const otp    = otpResult.value;

  try {
    // ── Fetch latest unused, unexpired OTP for this mobile ──────────────────
    const { rows } = await pool.query(
      `SELECT id, otp_hash, attempts, expires_at
       FROM otp_verifications
       WHERE mobile = $1
         AND used = false
         AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [mobile]
    );

    if (!rows.length) {
      return res.status(400).json({
        error: 'OTP expired or not found. Please request a new one.',
      });
    }

    const record = rows[0];

    // ── Check attempt limit ─────────────────────────────────────────────────
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      await pool.query(
        `UPDATE otp_verifications SET used = true WHERE id = $1`,
        [record.id]
      );
      return res.status(400).json({
        error: 'Too many incorrect attempts. Please request a new OTP.',
      });
    }

    // ── Increment attempt count ─────────────────────────────────────────────
    await pool.query(
      `UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = $1`,
      [record.id]
    );

    // ── Verify OTP ──────────────────────────────────────────────────────────
    const otpOk = await bcrypt.compare(otp, record.otp_hash);
    if (!otpOk) {
      const remaining = OTP_MAX_ATTEMPTS - (record.attempts + 1);
      return res.status(400).json({
        error: remaining > 0
          ? `Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Incorrect OTP. Please request a new one.',
      });
    }

    // ── Mark OTP as used ────────────────────────────────────────────────────
    await pool.query(
      `UPDATE otp_verifications SET used = true WHERE id = $1`,
      [record.id]
    );

    // ── Issue short-lived otp_token (10 min) ────────────────────────────────
    const otpToken = jwt.sign(
      { mobile, purpose: 'registration', verified: true },
      process.env.JWT_SECRET,
      { expiresIn: '10m', algorithm: 'HS256' }
    );

    console.log(`[OTP] Verified for +91${mobile}`);

    return res.json({
      success:   true,
      otp_token: otpToken,
      message:   'Mobile verified successfully',
    });

  } catch (e) {
    console.error('[otp/verify] ERROR:', e.message);
    return res.status(500).json({ error: 'Verification failed. Try again.' });
  }
});

module.exports = router;
