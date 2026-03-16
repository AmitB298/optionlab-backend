/**
 * routes/export.routes.js
 * Admin data export — CSV, Excel (SpreadsheetML), JSON
 *
 * All exports:
 *  - Require admin JWT (inherited from parent router)
 *  - Are audit-logged
 *  - Never expose mpin_hash, api_key, totp_secret
 *  - Cap at 10,000 rows
 *  - Validate all filter params before use
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const { Pool } = require('pg');
require('dotenv').config();

const { auditLog, requireAdmin, adminSecurityHeaders } = require('../middleware/admin.middleware');

const pool    = new Pool({ connectionString: process.env.DATABASE_URL });
const MAX_ROWS = 10_000;

// Auth on all export routes
router.use(adminSecurityHeaders);
router.use(requireAdmin);

// ── Format: CSV ───────────────────────────────────────────────────────────────
function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\r\n');
}

// ── Format: SpreadsheetML XML (Excel opens natively, no packages needed) ─────
function toXLSX(rows, sheetName) {
  if (!rows.length) return buildML([['No data']], sheetName);
  const headers = Object.keys(rows[0]);
  const data = [headers, ...rows.map(r => headers.map(h => {
    const v = r[h];
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return v.toISOString();
    return v;
  }))];
  return buildML(data, sheetName);
}

function buildML(data, sheetName) {
  const xmlRows = data.map((row, ri) => {
    const cells = row.map(cell => {
      const v = String(cell === null || cell === undefined ? '' : cell)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return '<Cell><Data ss:Type="String">' + v + '</Data></Cell>';
    }).join('');
    return '<Row ss:Index="' + (ri+1) + '">' + cells + '</Row>';
  }).join('');
  return '<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    '<Worksheet ss:Name="' + sheetName + '"><Table>' + xmlRows + '</Table></Worksheet></Workbook>';
}

// ── Send response ─────────────────────────────────────────────────────────────
function sendExport(res, rows, format, filename, sheetName) {
  const date = new Date().toISOString().slice(0,10);
  if (format === 'json') {
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '_' + date + '.json"');
    res.setHeader('Content-Type', 'application/json');
    return res.send(JSON.stringify({ exported_at: new Date().toISOString(), count: rows.length, data: rows }, null, 2));
  }
  if (format === 'xlsx') {
    const xml = toXLSX(rows, sheetName);
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '_' + date + '.xls"');
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    return res.send(xml);
  }
  // CSV default — UTF-8 BOM for Excel to correctly read Indian names
  const csv = toCSV(rows);
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '_' + date + '.csv"');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  return res.send('\uFEFF' + csv);
}

// ── Date param parser ─────────────────────────────────────────────────────────
function parseDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ── Format whitelist ──────────────────────────────────────────────────────────
function getFormat(raw) {
  return ['csv','json','xlsx'].includes(raw) ? raw : 'csv';
}

// ═════════════════════════════════════════════════════════════════════════════
// GET /admin/api/export/users
// Params: format, plan, status, from, to, search
// ═════════════════════════════════════════════════════════════════════════════
router.get('/users', auditLog('EXPORT_USERS'), async (req, res) => {
  try {
    const format = getFormat(req.query.format);
    const where  = ["u.role = 'user'"];
    const params = [];

    if (req.query.search) { params.push('%' + String(req.query.search).slice(0,100).replace(/[%_]/g,'\\$&') + '%'); where.push('(u.name ILIKE $' + params.length + ' OR u.mobile ILIKE $' + params.length + ')'); }
    if (['FREE','PAID','TRIAL','SUSPENDED'].includes(req.query.plan)) { params.push(req.query.plan); where.push('u.plan = $' + params.length); }
    if (req.query.status === 'active')   where.push('u.is_active = true');
    if (req.query.status === 'inactive') where.push('u.is_active = false');
    if (req.query.flagged === 'true')    where.push('u.flagged = true');
    const from = parseDate(req.query.from); if (from) { params.push(from); where.push('u.created_at >= $' + params.length); }
    const to   = parseDate(req.query.to);   if (to)   { params.push(to);   where.push('u.created_at <= $' + params.length); }

    params.push(MAX_ROWS);
    const { rows } = await pool.query(`
      SELECT
        u.id                                                        AS "User ID",
        u.name                                                      AS "Name",
        u.mobile                                                    AS "Mobile",
        u.plan                                                      AS "Plan",
        CASE WHEN u.is_active THEN 'Active' ELSE 'Inactive' END    AS "Status",
        CASE WHEN u.flagged   THEN 'Yes'    ELSE 'No'       END    AS "Flagged",
        u.flag_reason                                               AS "Flag Reason",
        u.created_at                                                AS "Joined",
        ua.last_login_at                                            AS "Last Login",
        ua.total_logins                                             AS "Total Logins",
        ua.last_login_ip                                            AS "Last IP",
        ua.last_device                                              AS "Last Device",
        ua.failed_logins                                            AS "Failed Logins",
        (SELECT COUNT(*) FROM trusted_devices td WHERE td.user_id = u.id AND td.is_trusted = true) AS "Trusted Devices",
        CASE WHEN ac.user_id IS NOT NULL THEN 'Yes' ELSE 'No' END  AS "Has Angel Creds",
        ac.client_code                                              AS "Angel Client Code",
        u.notes                                                     AS "Admin Notes"
      FROM users u
      LEFT JOIN user_activity ua     ON ua.user_id = u.id
      LEFT JOIN angel_credentials ac ON ac.user_id = u.id
      WHERE ` + where.join(' AND ') + `
      ORDER BY u.created_at DESC
      LIMIT $` + params.length, params);

    sendExport(res, rows, format, 'jobber_pro_users', 'Users');
  } catch (err) {
    console.error('[Export/Users]', err.message);
    return res.status(500).json({ error: 'Export failed' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /admin/api/export/subscriptions
// Params: format, plan_to, from, to
// ═════════════════════════════════════════════════════════════════════════════
router.get('/subscriptions', auditLog('EXPORT_SUBSCRIPTIONS'), async (req, res) => {
  try {
    const format = getFormat(req.query.format);
    const where  = ['1=1'];
    const params = [];

    if (['FREE','PAID','TRIAL','SUSPENDED'].includes(req.query.plan_to)) { params.push(req.query.plan_to); where.push('sh.plan_to = $' + params.length); }
    const from = parseDate(req.query.from); if (from) { params.push(from); where.push('sh.created_at >= $' + params.length); }
    const to   = parseDate(req.query.to);   if (to)   { params.push(to);   where.push('sh.created_at <= $' + params.length); }
    params.push(MAX_ROWS);

    const { rows } = await pool.query(`
      SELECT sh.id AS "ID", u.name AS "User Name", u.mobile AS "Mobile",
             sh.plan_from AS "From Plan", sh.plan_to AS "To Plan",
             sh.reason AS "Reason", sh.amount AS "Amount (INR)",
             sh.payment_ref AS "Payment Ref", a.name AS "Changed By",
             sh.created_at AS "Changed At"
      FROM subscription_history sh
      JOIN  users u ON u.id = sh.user_id
      LEFT JOIN admins a ON a.id = sh.changed_by
      WHERE ` + where.join(' AND ') + `
      ORDER BY sh.created_at DESC LIMIT $` + params.length, params);

    sendExport(res, rows, format, 'jobber_pro_subscriptions', 'Subscriptions');
  } catch (err) {
    console.error('[Export/Subs]', err.message);
    return res.status(500).json({ error: 'Export failed' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /admin/api/export/devices
// Params: format, platform, trusted
// ═════════════════════════════════════════════════════════════════════════════
router.get('/devices', auditLog('EXPORT_DEVICES'), async (req, res) => {
  try {
    const format = getFormat(req.query.format);
    const where  = ['1=1'];
    const params = [];

    if (['electron','web','mobile'].includes(req.query.platform)) { params.push(req.query.platform); where.push('td.platform = $' + params.length); }
    if (req.query.trusted === 'true')  where.push('td.is_trusted = true');
    if (req.query.trusted === 'false') where.push('td.is_trusted = false');
    params.push(MAX_ROWS);

    const { rows } = await pool.query(`
      SELECT td.id AS "Device ID", u.name AS "User Name", u.mobile AS "Mobile", u.plan AS "Plan",
             td.device_name AS "Device Name", td.platform AS "Platform",
             td.ip_address AS "IP Address",
             CASE WHEN td.is_trusted THEN 'Yes' ELSE 'No' END AS "Trusted",
             td.verified_at AS "Verified At", td.last_seen_at AS "Last Seen",
             td.trust_expires_at AS "Trust Expires", td.created_at AS "First Seen"
      FROM trusted_devices td
      JOIN users u ON u.id = td.user_id
      WHERE ` + where.join(' AND ') + `
      ORDER BY td.last_seen_at DESC NULLS LAST LIMIT $` + params.length, params);

    sendExport(res, rows, format, 'jobber_pro_devices', 'Devices');
  } catch (err) {
    console.error('[Export/Devices]', err.message);
    return res.status(500).json({ error: 'Export failed' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /admin/api/export/audit
// Params: format, action (uppercase+underscore only), success, from, to
// ═════════════════════════════════════════════════════════════════════════════
router.get('/audit', auditLog('EXPORT_AUDIT'), async (req, res) => {
  try {
    const format = getFormat(req.query.format);
    const where  = ['1=1'];
    const params = [];

    // action whitelist: only uppercase letters + underscore (no injection possible)
    if (req.query.action && /^[A-Z_]+$/.test(req.query.action)) { params.push(req.query.action); where.push('al.action = $' + params.length); }
    if (req.query.success === 'true')  where.push('al.success = true');
    if (req.query.success === 'false') where.push('al.success = false');
    const from = parseDate(req.query.from); if (from) { params.push(from); where.push('al.created_at >= $' + params.length); }
    const to   = parseDate(req.query.to);   if (to)   { params.push(to);   where.push('al.created_at <= $' + params.length); }
    params.push(MAX_ROWS);

    const { rows } = await pool.query(`
      SELECT al.id AS "Log ID", al.action AS "Action",
             adm.name AS "Admin", tgt.name AS "Target User", tgt.mobile AS "Target Mobile",
             CASE WHEN al.success THEN 'Yes' ELSE 'No' END AS "Success",
             al.ip_address AS "Admin IP", al.created_at AS "Timestamp"
      FROM admin_audit_log al
      LEFT JOIN admins adm ON adm.id = al.admin_id
      LEFT JOIN users tgt ON tgt.id = al.target_user_id
      WHERE ` + where.join(' AND ') + `
      ORDER BY al.created_at DESC LIMIT $` + params.length, params);

    sendExport(res, rows, format, 'jobber_pro_audit', 'Audit Log');
  } catch (err) {
    console.error('[Export/Audit]', err.message);
    return res.status(500).json({ error: 'Export failed' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /admin/api/export/summary  — full JSON snapshot
// ═════════════════════════════════════════════════════════════════════════════
router.get('/summary', auditLog('EXPORT_FULL_SUMMARY'), async (req, res) => {
  try {
    const [stats, users, subs] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total_users, COUNT(*) FILTER (WHERE plan='PAID') AS paid, COUNT(*) FILTER (WHERE plan='FREE') AS free, COUNT(*) FILTER (WHERE is_active=true) AS active, COUNT(*) FILTER (WHERE flagged=true) AS flagged FROM users WHERE role='user'`),
      pool.query(`SELECT u.id, u.name, u.mobile, u.plan, CASE WHEN u.is_active THEN 'Active' ELSE 'Inactive' END AS status, u.created_at, ua.last_login_at, ua.total_logins FROM users u LEFT JOIN user_activity ua ON ua.user_id=u.id WHERE u.role='user' ORDER BY u.created_at DESC LIMIT ${MAX_ROWS}`),
      pool.query(`SELECT sh.id, u.name, u.mobile, sh.plan_from, sh.plan_to, sh.amount, sh.payment_ref, sh.created_at FROM subscription_history sh JOIN users u ON u.id=sh.user_id ORDER BY sh.created_at DESC LIMIT ${MAX_ROWS}`),
    ]);
    const date = new Date().toISOString().slice(0,10);
    res.setHeader('Content-Disposition', 'attachment; filename="jobber_pro_summary_' + date + '.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({ exported_at: new Date().toISOString(), summary: stats.rows[0], users: users.rows, subscriptions: subs.rows }, null, 2));
  } catch (err) {
    console.error('[Export/Summary]', err.message);
    return res.status(500).json({ error: 'Export failed' });
  }
});

module.exports = router;
