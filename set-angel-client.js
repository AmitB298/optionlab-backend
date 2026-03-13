const { Pool } = require('pg');
const p = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

p.query(
  "UPDATE users SET angel_one_client_id = $1 WHERE mobile = $2 RETURNING mobile, angel_one_client_id",
  ['SBHS331', '9999999999']
)
.then(r => console.log('Updated:', r.rows))
.finally(() => p.end());
