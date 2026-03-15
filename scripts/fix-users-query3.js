const fs = require('fs');
let c = fs.readFileSync('src/routes/admin.routes.js', 'utf8');

// Fix 1: SORT_COLS - last_login_at was on 'ua', now it's on 'u'
c = c.replace(
  `const SORT_COLS = { created_at: 'u', last_login_at: 'ua', name: 'u', mobile: 'u' };`,
  `const SORT_COLS = { created_at: 'u', last_login_at: 'u', name: 'u', mobile: 'u' };`
);

// Fix 2: COUNT query - drop the LEFT JOIN user_activity
c = c.replace(
  '`SELECT COUNT(*) FROM users u\n       LEFT JOIN user_activity ua ON ua.user_id = u.id ${whereClause}`',
  '`SELECT COUNT(*) FROM users u ${whereClause}`'
);

// Fix 3: User detail query - replace joins with direct columns
const oldDetail = `        SELECT u.id, u.name, u.mobile, u.plan, u.is_active, u.flagged,
               u.flag_reason, u.notes, u.role, u.created_at,
               ua.total_logins, ua.last_login_at, ua.last_login_ip,
               ua.last_device, ua.failed_logins, ua.session_count,
               CASE WHEN ac.user_id IS NOT NULL THEN true ELSE false END AS has_angel_creds,
               ac.client_code AS angel_client_code
         FROM users u
         LEFT JOIN user_activity ua ON ua.user_id = u.id
         LEFT JOIN angel_credentials ac ON ac.user_id = u.id
         WHERE u.id = $1`;

const newDetail = `        SELECT u.id, u.name, u.mobile, u.plan, u.is_active, u.flagged,
               u.flag_reason, u.notes, u.role, u.created_at,
               u.login_count AS total_logins, u.last_login_at,
               u.angel_client_code
         FROM users u
         WHERE u.id = $1`;

if (c.includes(oldDetail)) {
  c = c.replace(oldDetail, newDetail);
  console.log('Fix 3 applied');
} else {
  console.log('Fix 3 NOT found');
}

fs.writeFileSync('src/routes/admin.routes.js', c);
console.log('Done');

const lines = c.split('\n');
lines.forEach((l, i) => {
  if (l.includes('ua.') || l.includes('user_activity') || l.includes('angel_credentials'))
    console.log('REMAINING: ' + (i+1) + ': ' + l.trim().substring(0, 100));
});
