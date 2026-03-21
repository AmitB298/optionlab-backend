'use strict';
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: 'postgresql://postgres:MsbhWaBlBEjCrtPUTXUaydgkabfNuogC@metro.proxy.rlwy.net:10759/railway',
  ssl: { rejectUnauthorized: false },
});

async function run() {
  const hash = await bcrypt.hash('admin123', 12);
  console.log('Generated hash:', hash);

  const result = await pool.query(
    'UPDATE blog_authors SET password_hash = $1 WHERE email = $2',
    [hash, 'amit@optionslab.in']
  );
  console.log('Rows updated:', result.rowCount);

  if (result.rowCount === 0) {
    console.log('No row found — inserting author instead...');
    await pool.query(
      `INSERT INTO blog_authors (name, email, password_hash, role, bio, initials, avatar_color, is_admin)
       VALUES ('Amit B', 'amit@optionslab.in', $1, 'Senior Analyst', 'Founder of OptionsLab.', 'AB', '#ff9f0a', true)
       ON CONFLICT (email) DO UPDATE SET password_hash = $1`,
      [hash]
    );
    console.log('Author upserted.');
  }

  console.log('Done. Login: amit@optionslab.in / admin123');
  await pool.end();
}

run().catch(err => { console.error(err.message); pool.end(); });
