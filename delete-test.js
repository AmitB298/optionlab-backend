const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:MsbhWaBlBEjCrtPUTXUaydgkabfNuogC@metro.proxy.rlwy.net:10759/railway' });
pool.query("DELETE FROM blog_articles WHERE title = 'Test Article'")
  .then(r => { console.log('Deleted:', r.rowCount, 'rows'); pool.end(); })
  .catch(e => { console.log('ERROR:', e.message); pool.end(); });
