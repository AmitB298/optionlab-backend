const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.query('SELECT id, mobile, name, plan, is_active, angel_one_client_id, created_at FROM users ORDER BY created_at DESC')
  .then(r => {
    console.log('\n=== USERS IN DATABASE ===');
    r.rows.forEach(u => {
      console.log(`
Mobile:           ${u.mobile}
Name:             ${u.name}
Plan:             ${u.plan}
Active:           ${u.is_active}
Angel Client ID:  ${u.angel_one_client_id || '(not set)'}
Created:          ${u.created_at}
---`);
    });
    pool.end();
  })
  .catch(e => { console.error(e.message); pool.end(); });
