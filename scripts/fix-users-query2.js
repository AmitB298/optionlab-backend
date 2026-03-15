const fs = require('fs');
let c = fs.readFileSync('src/routes/admin.routes.js', 'utf8');

// Replace the broken multi-join SELECT with a clean single-table query
const oldQuery = `      SELECT
        u.id, u.name, u.mobile, u.plan, u.is_active, u.flagged,
        u.flag_reason, u.notes, u.created_at,
        ua.last_login_at, ua.total_logins, ua.last_login_ip, ua.last_device,
        ua.failed_logins,
        (SELECT COUNT(*) FROM trusted_devices td
         WHERE td.user_id = u.id AND td.is_trusted = true)       AS trusted_devices,
        CASE WHEN ac.user_id IS NOT NULL THEN true ELSE false END AS has_angel_credentials
      FROM users u
      LEFT JOIN user_activity ua ON ua.user_id = u.id
      LEFT JOIN angel_credentials ac ON ac.user_id = u.id`;

const newQuery = `      SELECT
        u.id, u.name, u.mobile, u.plan, u.is_active, u.flagged,
        u.flag_reason, u.notes, u.created_at,
        u.last_login_at, u.login_count AS total_logins,
        u.angel_client_code,
        (SELECT COUNT(*) FROM trusted_devices td
         WHERE td.user_id = u.id AND td.is_trusted = true) AS trusted_devices
      FROM users u`;

if (c.includes(oldQuery)) {
  c = c.replace(oldQuery, newQuery);
  fs.writeFileSync('src/routes/admin.routes.js', c);
  console.log('Fixed main users query');
} else {
  console.log('Pattern not found - manual fix needed');
}
