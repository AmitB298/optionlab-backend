'use strict';
const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const { auth: authenticateToken } = require('../middleware/auth');
const { getReferralStats, redeemWallet } = require('../services/referral.service');

// GET /api/referral/stats
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await getReferralStats(req.user.id);
    if (!stats) return res.status(500).json({ error: 'Failed to load referral stats' });
    return res.json({ success: true, ...stats });
  } catch (e) {
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/referral/redeem
router.post('/redeem', authenticateToken, async (req, res) => {
  try {
    const result = await redeemWallet(req.user.id);
    if (!result.success) return res.status(400).json({ error: result.message, currentBalance: result.currentBalance });
    return res.json({ success: true, message: result.message, currentBalance: result.currentBalance });
  } catch (e) {
    return res.status(500).json({ error: 'Redemption failed. Try again.' });
  }
});

// POST /api/referral/track-click
router.post('/track-click', async (req, res) => {
  try {
    const { referral_code } = req.body;
    if (!referral_code) return res.status(400).json({ error: 'referral_code required' });
    await pool.query(
      `INSERT INTO referral_clicks (referral_code, ip_address, user_agent) VALUES ($1, $2, $3)`,
      [referral_code.toUpperCase(), req.ip, req.headers['user-agent']?.slice(0, 200) || null]
    );
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/referral/leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.name, w.tier, w.total_conversions,
             ROUND(w.lifetime_earned / 100.0, 0) AS lifetime_earned_inr
      FROM referral_wallet w
      JOIN users u ON u.id = w.user_id
      WHERE w.total_conversions > 0
      ORDER BY w.total_conversions DESC, w.lifetime_earned DESC
      LIMIT 10
    `);
    return res.json({ success: true, leaderboard: rows });
  } catch (e) {
    return res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;
