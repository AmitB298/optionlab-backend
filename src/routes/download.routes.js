'use strict';
/**
 * download.routes.js — Secure Jobber Pro download
 *
 * GET /api/download/jobber-pro  → authenticated download
 * GET /api/download/info        → version info (public)
 *
 * Files stored in: public/releases/ (or configure DOWNLOAD_URL for S3/CDN)
 *
 * Strategy:
 *   - If DOWNLOAD_URL env is set → redirect to signed CDN URL
 *   - Otherwise → serve local file from public/releases/
 *   - Either way, user must be authenticated
 *   - Download is logged for analytics
 */

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();
const pool    = require('../db/pool');
const { auth } = require('../middleware/auth');

// Latest version info — update this when you release a new version
const LATEST = {
  version:     process.env.APP_VERSION     || '1.0.0',
  filename:    process.env.APP_FILENAME    || 'JobberPro-Setup-1.0.0.exe',
  releaseDate: process.env.APP_RELEASE_DATE || '2026-03-28',
  changelog:   process.env.APP_CHANGELOG   || 'Initial release — Live Options Chain, GEX, Strategy Lab',
  minRequirements: {
    os:       'Windows 10 / 11 (64-bit)',
    ram:      '4 GB',
    disk:     '200 MB',
    broker:   'Angel One account required',
  },
};

// ── GET /api/download/info (public) ──────────────────────────────────────
router.get('/info', (req, res) => {
  return res.json({ success: true, latest: LATEST });
});

// ── GET /api/download/jobber-pro (auth required) ──────────────────────────
router.get('/jobber-pro', auth, async (req, res) => {
  const userId = req.user.id;

  // Log the download attempt
  pool.query(`
    INSERT INTO download_log (user_id, version, ip_address, created_at)
    VALUES ($1, $2, $3, NOW())
  `, [userId, LATEST.version, req.ip]).catch(() => {});
  // (Table created below if not exists — ignore error if table doesn't exist yet)

  // ── Option 1: External download URL (S3, CDN, Google Drive direct link) ──
  const externalUrl = process.env.DOWNLOAD_URL;
  if (externalUrl) {
    // Track then redirect
    console.log(`[download] User ${userId} downloading v${LATEST.version} via CDN`);
    return res.redirect(302, externalUrl);
  }

  // ── Option 2: Serve local file ────────────────────────────────────────────
  const filePath = path.join(__dirname, '..', '..', 'public', 'releases', LATEST.filename);

  if (!fs.existsSync(filePath)) {
    console.error('[download] File not found:', filePath);
    return res.status(404).json({
      error:   'Download not available yet.',
      message: 'The Jobber Pro installer is being prepared. Please check back soon or contact support@optionslab.in',
    });
  }

  console.log(`[download] User ${userId} downloading v${LATEST.version} from local`);
  res.setHeader('Content-Disposition', `attachment; filename="${LATEST.filename}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  return res.sendFile(filePath);
});

// ── Ensure download_log table exists ─────────────────────────────────────
pool.query(`
  CREATE TABLE IF NOT EXISTS download_log (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    version     VARCHAR(20),
    ip_address  VARCHAR(45),
    created_at  TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(() => {});
// Bug #8: download_log now has proper FK — user deletion cascades correctly

module.exports = router;

// POST /api/download/request → alias for GET /api/download/jobber-pro
// Frontend calls this via POST, we handle it and return a download URL
router.post('/request', auth, async (req, res) => {
  const userId = req.user.id;

  // Log download attempt
  pool.query(
    `INSERT INTO download_log (user_id, version, ip_address, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [userId, LATEST.version, req.ip]
  ).catch(() => {});

  // If external URL configured, return it as download_url
  const externalUrl = process.env.DOWNLOAD_URL;
  if (externalUrl) {
    return res.json({
      success: true,
      download_url: externalUrl,
      version: LATEST.version,
      filename: LATEST.filename,
    });
  }

  // Otherwise return a URL to the authenticated GET endpoint
  return res.json({
    success: true,
    download_url: null,
    version: LATEST.version,
    filename: LATEST.filename,
    message: 'Use GET /api/download/jobber-pro to download directly',
  });
});
