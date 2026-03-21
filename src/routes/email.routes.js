'use strict';

/**
 * email.routes.js
 * Mount at: /api/email
 *
 * Routes:
 *   POST /send-magic-link   — generate token, store in DB, send email
 *   POST /verify-token      — validate token, return signed email_token JWT
 *   POST /check-verified    — polling: is this email verified yet?
 */

const express  = require('express');
const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const pool = require('../db/pool');
const { sendMagicLinkEmail } = require('../services/emailService');

const router = express.Router();

const MAGIC_EXPIRES_MINUTES = 15;
const EMAIL_TOKEN_EXPIRES   = '30m';
const JWT_SECRET            = process.env.JWT_SECRET;

function isValidEmail(email) {
  return typeof email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    email.trim().length <= 254;
}

function isValidUrl(url) {
  try { new URL(url); return true; } catch { return false; }
}

/* ══════════════════════════════════════════════════════════════
   POST /api/email/send-magic-link
   Body: { email, redirect_url }
══════════════════════════════════════════════════════════════ */
router.post('/send-magic-link', async (req, res) => {
  try {
    const email       = (req.body.email       || '').trim().toLowerCase();
    const redirectUrl = (req.body.redirect_url || '').trim();

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (!redirectUrl || !isValidUrl(redirectUrl)) {
      return res.status(400).json({ error: 'Invalid redirect URL' });
    }

    // Check if email already has a registered account
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists. Please login instead.' });
    }

    // Rate limit: max 3 magic links per email per 10 minutes
    const rateCheck = await pool.query(
      `SELECT COUNT(*) AS cnt FROM email_verifications
       WHERE email = $1
         AND created_at > NOW() - INTERVAL '10 minutes'`,
      [email]
    );
    if (parseInt(rateCheck.rows[0].cnt, 10) >= 3) {
      return res.status(429).json({ error: 'Too many requests. Please wait a few minutes before trying again.' });
    }

    // Generate secure token
    const rawToken  = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + MAGIC_EXPIRES_MINUTES * 60 * 1000);

    // Invalidate previous unused tokens for this email
    await pool.query(
      `UPDATE email_verifications
       SET used = true
       WHERE email = $1 AND used = false AND verified = false`,
      [email]
    );

    await pool.query(
      `INSERT INTO email_verifications
         (email, token, redirect_url, expires_at, verified, used, created_at)
       VALUES ($1, $2, $3, $4, false, false, NOW())`,
      [email, rawToken, redirectUrl, expiresAt]
    );

    const magicLink = `${redirectUrl}?token=${rawToken}&email=${encodeURIComponent(email)}`;

    await sendMagicLinkEmail({ to: email, magicLink, expiresMinutes: MAGIC_EXPIRES_MINUTES });

    console.log(`[Email] Magic link sent to ${email}`);
    return res.json({ ok: true, message: 'Magic link sent' });

  } catch (err) {
    console.error('[Email] send-magic-link error:', err.message);
    return res.status(500).json({ error: 'Failed to send magic link. Please try again.' });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /api/email/verify-token
   Body: { token, email }
   Called by verify.html on page load
══════════════════════════════════════════════════════════════ */
router.post('/verify-token', async (req, res) => {
  try {
    const token = (req.body.token || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();

    if (!token || !email) {
      return res.status(400).json({ error: 'Missing token or email' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const result = await pool.query(
      `SELECT id, expires_at, verified, used
       FROM email_verifications
       WHERE token = $1 AND email = $2`,
      [token, email]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired magic link. Please request a new one.' });
    }

    const row = result.rows[0];

    if (row.used) {
      return res.status(400).json({ error: 'This link has already been used. Please request a new one.' });
    }
    if (new Date() > new Date(row.expires_at)) {
      return res.status(400).json({ error: 'Magic link has expired. Please request a new one.' });
    }

    // Mark as verified (not used — used only after full registration completes)
    await pool.query(
      `UPDATE email_verifications
       SET verified = true, verified_at = NOW()
       WHERE id = $1`,
      [row.id]
    );

    const emailToken = jwt.sign(
      { email, verification_id: row.id, purpose: 'email_verification' },
      JWT_SECRET,
      { expiresIn: EMAIL_TOKEN_EXPIRES }
    );

    console.log(`[Email] Verified: ${email}`);
    return res.json({ ok: true, email_token: emailToken });

  } catch (err) {
    console.error('[Email] verify-token error:', err.message);
    return res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

/* ══════════════════════════════════════════════════════════════
   POST /api/email/check-verified
   Body: { email }
   Polled by register.html every 3 seconds
══════════════════════════════════════════════════════════════ */
router.post('/check-verified', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const result = await pool.query(
      `SELECT id
       FROM email_verifications
       WHERE email = $1
         AND verified = true
         AND used = false
         AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.json({ verified: false });
    }

    const row = result.rows[0];

    const emailToken = jwt.sign(
      { email, verification_id: row.id, purpose: 'email_verification' },
      JWT_SECRET,
      { expiresIn: EMAIL_TOKEN_EXPIRES }
    );

    return res.json({ verified: true, email_token: emailToken });

  } catch (err) {
    console.error('[Email] check-verified error:', err.message);
    return res.status(500).json({ error: 'Check failed' });
  }
});

module.exports = router;
