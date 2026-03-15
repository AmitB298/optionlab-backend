const fs = require('fs');
let c = fs.readFileSync('src/routes/admin.routes.js', 'utf8');

// Fix user detail query with regex (whitespace-insensitive)
c = c.replace(
  /SELECT u\.id, u\.name, u\.mobile, u\.plan, u\.is_active, u\.flagged,[\s\S]*?LEFT JOIN angel_credentials ac ON ac\.user_id = u\.id\s*\n\s*WHERE u\.id = \$1/,
  `SELECT u.id, u.name, u.mobile, u.plan, u.is_active, u.flagged,
               u.flag_reason, u.notes, u.role, u.created_at,
               u.login_count AS total_logins, u.last_login_at,
               u.angel_client_code
         FROM users u
         WHERE u.id = $1`
);

// Fix stats activity query - user_activity table doesn't exist, use users table
c = c.replace(
  /SELECT\s*COUNT\(\*\) FILTER \(WHERE last_login_at > NOW\(\) - INTERVAL '1 day'\)\s*AS dau,[\s\S]*?FROM user_activity/,
  `SELECT
          COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '1 day')  AS dau,
          COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '7 days') AS wau,
          COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '30 days')AS mau
         FROM users`
);

fs.writeFileSync('src/routes/admin.routes.js', c);
console.log('Done');

const lines = c.split('\n');
lines.forEach((l, i) => {
  if (l.includes('ua.') || l.includes('user_activity') || l.includes('angel_credentials'))
    console.log('REMAINING: ' + (i+1) + ': ' + l.trim().substring(0, 100));
});
