const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DB_URL });
pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'trusted_devices' ORDER BY ordinal_position")
  .then(r => { r.rows.forEach(c => console.log(c.column_name)); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });
