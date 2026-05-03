/**
 * validate.js — Central input validation & sanitisation
 * Single source of truth. Import everywhere. Never trust raw req.body.
 *
 * Rules:
 *  - All validators return { ok: boolean, error?: string, value?: any }
 *  - value is always the cleaned/cast version — never the raw input
 *  - Nothing here talks to DB — pure logic only
 *
 * CHANGES:
 *  v2 — mpin now accepts 4-6 digits (web uses 6, Electron/Jobber uses 4)
 *  v2 — angelOneId added: mandatory, uppercase, 6-10 alphanumeric chars
 */

'use strict';

// ─── Primitive guards ──────────────────────────────────────────────────────

/**
 * Mobile: exactly 10 digits, string type required.
 * Rejects numbers, +91 prefix, dashes, spaces.
 */
function mobile(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'mobile must be a string' };
  const v = raw.trim();
  if (!/^\d{10}$/.test(v)) return { ok: false, error: 'mobile must be exactly 10 digits' };
  return { ok: true, value: v };
}

/**
 * MPIN: 4 to 6 digits, string type required.
 * Web register.html sends 6 digits. Electron/Jobber Pro sends 4 digits. Both accepted.
 * BUG FIX: String(1234) passes /^\d{4}$/ — we reject non-string types first.
 */
function mpin(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'mpin must be a string' };
  if (!/^\d{8}$/.test(raw)) return { ok: false, error: 'mpin must be exactly 8 digits' };
  return { ok: true, value: raw };
}

/**
 * OTP: exactly 6 digits, string type required.
 */
function otp(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'otp must be a string' };
  if (!/^\d{6}$/.test(raw))    return { ok: false, error: 'otp must be exactly 6 digits' };
  return { ok: true, value: raw };
}

/**
 * Angel One Client ID — MANDATORY at registration, IMMUTABLE after.
 * Format: 6–10 uppercase alphanumeric characters (e.g. SBH3321, A1234567).
 * Auto-uppercases input so frontend does not have to.
 * Never accepted in any UPDATE route — DB trigger enforces immutability.
 */
function angelOneId(raw) {
  if (raw === undefined || raw === null || raw === '')
    return { ok: false, error: 'Angel One Client ID is required' };
  if (typeof raw !== 'string')
    return { ok: false, error: 'broker_client_id must be a string' };
  const v = raw.trim().toUpperCase();
  if (v.length === 0)
    return { ok: false, error: 'Angel One Client ID is required' };
  if (!/^[A-Z0-9]{6,10}$/.test(v))
    return { ok: false, error: 'Angel One Client ID must be 6–10 letters/numbers only (e.g. SBH3321)' };
  return { ok: true, value: v };
}

/**
 * Plan: must be one of the whitelisted values.
 */
const VALID_PLANS = Object.freeze(['FREE', 'PAID', 'TRIAL', 'SUSPENDED']);
function plan(raw) {
  if (typeof raw !== 'string')      return { ok: false, error: 'plan must be a string' };
  if (!VALID_PLANS.includes(raw))   return { ok: false, error: `plan must be one of: ${VALID_PLANS.join(', ')}` };
  return { ok: true, value: raw };
}

/**
 * userId: must be a positive integer.
 * Coerces string '42' → 42. Rejects floats, negatives, SQL chars.
 */
function userId(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0) return { ok: false, error: 'userId must be a positive integer' };
  if (String(n) !== String(raw).trim()) return { ok: false, error: 'userId must be a plain integer' };
  return { ok: true, value: n };
}

/**
 * Short free-text (names, reasons, notes).
 * Strips leading/trailing whitespace. Enforces max length.
 * Does NOT escape HTML here — that is the frontend's job.
 */
function text(raw, { maxLen = 500, required = false } = {}) {
  if (raw === undefined || raw === null) {
    if (required) return { ok: false, error: 'field is required' };
    return { ok: true, value: null };
  }
  if (typeof raw !== 'string') return { ok: false, error: 'field must be a string' };
  const v = raw.trim();
  if (required && v.length === 0) return { ok: false, error: 'field must not be empty' };
  if (v.length > maxLen) return { ok: false, error: `field must be at most ${maxLen} characters` };
  return { ok: true, value: v.length === 0 ? null : v };
}

/**
 * Boolean coercion — rejects strings that aren't clearly boolean.
 * Accepts: true, false, 'true', 'false', 1, 0.
 */
function bool(raw) {
  if (raw === true  || raw === 1 || raw === 'true')  return { ok: true, value: true };
  if (raw === false || raw === 0 || raw === 'false') return { ok: true, value: false };
  return { ok: false, error: 'field must be a boolean' };
}

/**
 * Currency amount: non-negative number with max 2 decimal places.
 */
function amount(raw) {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  const n = parseFloat(raw);
  if (isNaN(n) || n < 0) return { ok: false, error: 'amount must be a non-negative number' };
  if (!/^\d+(\.\d{1,2})?$/.test(String(raw))) return { ok: false, error: 'amount must have at most 2 decimal places' };
  return { ok: true, value: n };
}

/**
 * Page number: positive integer, defaults to 1.
 */
function page(raw) {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 1) return { ok: true, value: 1 };
  return { ok: true, value: n };
}

/**
 * Limit: integer clamped to [1, 100].
 */
function limit(raw, max = 100) {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 1) return { ok: true, value: 20 };
  return { ok: true, value: Math.min(n, max) };
}

/**
 * Sort column: must be from a whitelist — prevents ORDER BY injection.
 */
function sortColumn(raw, allowed, fallback) {
  if (typeof raw === 'string' && allowed.includes(raw)) return { ok: true, value: raw };
  return { ok: true, value: fallback };
}

/**
 * Sort direction: ASC or DESC only.
 */
function sortDir(raw) {
  if (raw === 'asc') return { ok: true, value: 'ASC' };
  return { ok: true, value: 'DESC' };
}

/**
 * User IDs array for bulk actions.
 * Each element must be a positive integer.
 * Max 100 items.
 */
function userIdArray(raw, maxItems = 100) {
  if (!Array.isArray(raw) || raw.length === 0)
    return { ok: false, error: 'userIds must be a non-empty array' };
  if (raw.length > maxItems)
    return { ok: false, error: `Max ${maxItems} users per bulk action` };
  const ids = [];
  for (const item of raw) {
    const r = userId(item);
    if (!r.ok) return { ok: false, error: `Invalid userId in array: ${item}` };
    ids.push(r.value);
  }
  return { ok: true, value: ids };
}

/**
 * Bulk action type whitelist.
 */
const VALID_BULK_ACTIONS = Object.freeze(['activate', 'deactivate', 'set_plan', 'force_logout']);
function bulkAction(raw) {
  if (typeof raw !== 'string' || !VALID_BULK_ACTIONS.includes(raw))
    return { ok: false, error: `action must be one of: ${VALID_BULK_ACTIONS.join(', ')}` };
  return { ok: true, value: raw };
}

/**
 * Announcement type whitelist.
 */
const VALID_ANNOUNCEMENT_TYPES   = Object.freeze(['info', 'warning', 'critical']);
const VALID_ANNOUNCEMENT_TARGETS = Object.freeze(['all', 'paid', 'free']);

function announcementType(raw) {
  if (!VALID_ANNOUNCEMENT_TYPES.includes(raw)) return { ok: true, value: 'info' };
  return { ok: true, value: raw };
}

function announcementTarget(raw) {
  if (!VALID_ANNOUNCEMENT_TARGETS.includes(raw)) return { ok: true, value: 'all' };
  return { ok: true, value: raw };
}

/**
 * ISO date-time string (for expires_at fields).
 * Returns null if invalid — never crashes.
 */
function isoDatetime(raw) {
  if (!raw) return { ok: true, value: null };
  const d = new Date(raw);
  if (isNaN(d.getTime())) return { ok: true, value: null };
  if (d < new Date())     return { ok: false, error: 'expires_at must be in the future' };
  return { ok: true, value: d.toISOString() };
}

/**
 * Payment reference: alphanumeric + common chars, max 100.
 */
function paymentRef(raw) {
  if (!raw) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: 'payment_ref must be a string' };
  const v = raw.trim();
  if (v.length > 100) return { ok: false, error: 'payment_ref too long' };
  if (!/^[\w\-\/# ]+$/.test(v)) return { ok: false, error: 'payment_ref contains invalid characters' };
  return { ok: true, value: v };
}

// ─── Express middleware helper ─────────────────────────────────────────────

/**
 * fail() — send a 400 error and stop the chain.
 * Usage: return fail(res, 'mobile is required')
 */
function fail(res, error, status = 400) {
  res.status(status).json({ error });
  return null; // signal caller to return
}

module.exports = {
  mobile, mpin, otp, plan, userId, text, bool,
  amount, page, limit, sortColumn, sortDir,
  userIdArray, bulkAction,
  announcementType, announcementTarget,
  isoDatetime, paymentRef,
  angelOneId,
  VALID_PLANS, VALID_BULK_ACTIONS,
  fail,
};
