const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const result = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'users' 
    ORDER BY ordinal_position
  `);
  console.log('Users table columns:');
  result.rows.forEach(r => console.log(' -', r.column_name, ':', r.data_type));
  await pool.end();
}
main().catch(console.error);