const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DB_URL });
pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
  .then(r => { r.rows.forEach(t => console.log(t.table_name)); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });
