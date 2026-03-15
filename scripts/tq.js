const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DB_URL });
pool.query("SELECT u.id, u.name, u.mobile, u.plan, u.is_active, u.flagged, u.flag_reason, u.notes, u.created_at, u.last_login_at, u.login_count AS total_logins, u.angel_client_code, (SELECT COUNT(*) FROM trusted_devices td WHERE td.user_id = u.id AND td.is_trusted = true) AS trusted_devices FROM users u WHERE u.role = 'user' ORDER BY u.created_at DESC NULLS LAST LIMIT 20 OFFSET 0")
  .then(r => { console.log('OK rows:', r.rows.length); pool.end(); })
  .catch(e => { console.error('ERROR:', e.message); pool.end(); });
