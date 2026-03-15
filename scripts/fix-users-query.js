const fs = require('fs');
let c = fs.readFileSync('src/routes/admin.routes.js', 'utf8');

// Replace the getAllUsers SELECT with one matching actual schema
c = c.replace(
  /SELECT[\s\S]*?FROM users[\s\S]*?(?=WHERE|ORDER|LIMIT|GROUP|\))/m,
  `SELECT id, name, mobile, plan, is_active, role, flagged, flag_reason, notes, angel_client_code, created_at, last_login_at, login_count FROM users `
);

fs.writeFileSync('src/routes/admin.routes.js', c);
console.log('Done');

// Show lines around FROM users to verify
const lines = c.split('\n');
lines.forEach((l, i) => {
  if (l.includes('FROM users') || l.includes('SELECT') && lines[i+1] && lines[i+1].includes('FROM users'))
    console.log((i+1) + ': ' + l.trim().substring(0, 120));
});
