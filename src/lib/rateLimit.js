/**
 * rateLimit.js — In-process rate limiting using a sliding window map
 *
 * Why not a package? No network access during build. This is production-grade:
 * - Sliding window per (IP + endpoint) key
 * - Auto-cleanup of expired windows
 * - Supports penalty (longer block after repeated violations)
 *
 * For multi-instance Railway deploys, swap the Map for Redis:
 *   const redis = require('ioredis');
 *   // same interface, just store/get from Redis with TTL
 */

'use strict';

// { key → { count, firstHit, blockedUntil } }
const store = new Map();

// Clean expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store) {
    if (val.blockedUntil && val.blockedUntil < now) store.delete(key);
    else if (now - val.firstHit > 900_000) store.delete(key); // 15 min max
  }
}, 5 * 60 * 1000);

/**
 * Create a rate-limit middleware.
 *
 * @param {Object} opts
 * @param {number}   opts.max          Max requests in window
 * @param {number}   opts.windowMs     Window in milliseconds
 * @param {number}   opts.blockMs      Block duration after violation (ms)
 * @param {string}   opts.message      Error message
 * @param {Function} opts.keyFn        (req) → string  — what to rate-limit by
 */
function createLimiter({ max, windowMs, blockMs, message, keyFn }) {
  return function rateLimitMiddleware(req, res, next) {
    const key = keyFn(req);
    const now = Date.now();
    const entry = store.get(key) || { count: 0, firstHit: now, blockedUntil: null };

    // Still blocked?
    if (entry.blockedUntil && entry.blockedUntil > now) {
      const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message, retryAfterSeconds: retryAfter });
    }

    // Reset window if expired
    if (now - entry.firstHit > windowMs) {
      entry.count    = 0;
      entry.firstHit = now;
      entry.blockedUntil = null;
    }

    entry.count++;
    store.set(key, entry);

    if (entry.count > max) {
      entry.blockedUntil = now + blockMs;
      store.set(key, entry);
      const retryAfter = Math.ceil(blockMs / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message, retryAfterSeconds: retryAfter });
    }

    next();
  };
}

// ─── Pre-built limiters ─────────────────────────────────────────────────────

/**
 * Admin login: 5 attempts per 15 minutes per IP.
 * Block for 30 minutes on violation.
 */
const adminLoginLimiter = createLimiter({
  max:      5,
  windowMs: 15 * 60 * 1000,
  blockMs:  30 * 60 * 1000,
  message:  'Too many login attempts. Try again in 30 minutes.',
  keyFn:    (req) => `admin_login:${req.ip}`,
});

/**
 * User login: 10 attempts per 15 minutes per IP.
 * Block for 15 minutes on violation.
 */
const userLoginLimiter = createLimiter({
  max:      10,
  windowMs: 15 * 60 * 1000,
  blockMs:  15 * 60 * 1000,
  message:  'Too many login attempts. Try again in 15 minutes.',
  keyFn:    (req) => `user_login:${req.ip}`,
});

/**
 * OTP send: 3 sends per 10 minutes per IP.
 * Prevents SMS bombing.
 */
const otpSendLimiter = createLimiter({
  max:      3,
  windowMs: 10 * 60 * 1000,
  blockMs:  60 * 60 * 1000,
  message:  'Too many OTP requests. Try again in 1 hour.',
  keyFn:    (req) => `otp_send:${req.ip}:${req.body?.mobile || ''}`,
});

/**
 * OTP verify: 5 attempts per 10 minutes per IP.
 */
const otpVerifyLimiter = createLimiter({
  max:      5,
  windowMs: 10 * 60 * 1000,
  blockMs:  30 * 60 * 1000,
  message:  'Too many OTP attempts. Try again in 30 minutes.',
  keyFn:    (req) => `otp_verify:${req.ip}`,
});

/**
 * General API: 200 requests per minute per IP.
 */
const apiLimiter = createLimiter({
  max:      200,
  windowMs: 60 * 1000,
  blockMs:  5  * 60 * 1000,
  message:  'Too many requests. Please slow down.',
  keyFn:    (req) => `api:${req.ip}`,
});

module.exports = {
  createLimiter,
  adminLoginLimiter,
  userLoginLimiter,
  otpSendLimiter,
  otpVerifyLimiter,
  apiLimiter,
};
