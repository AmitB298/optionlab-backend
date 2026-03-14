/**
 * routes/device.routes.js
 *
 * Device trust management.
 * When a user logs in from a new Electron install or new machine,
 * Railway sends an OTP to their mobile to verify the new device.
 * Once verified, that hardware ID is trusted forever (or until revoked).
 *
 * Endpoints:
 *   POST /api/device/send-otp    → send OTP to registered mobile for new device
 *   POST /api/device/verify-otp  → verify OTP, trust this device
 */

'use strict';

const express = require('express');
const router  = express.Router();
const { verifyDeviceOTP } = require('../services/device.service');
const V = require('../lib/validate');
const { otpSendLimiter, otpVerifyLimiter } = require('../lib/rateLimit');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

    const { initiateDeviceVerification } = require('../services/device.service');
    await initiateDeviceVerification(
      rows[0].id,
      rows[0].mobile,
      deviceIdResult.value,
      'Jobber Desktop'
    );

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
    const result = await verifyDeviceOTP(
      userIdResult.value,
      deviceIdResult.value,
      otpResult.value
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.json({ success: true, message: 'Device verified and trusted.' });
  } catch (e) {
    console.error('[device/verify-otp]', e.message);
    return res.status(500).json({ error: 'Verification failed.' });
  }
});

module.exports = router;
