const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: 'postgresql://postgres:MsbhWaBlBEjCrtPUTXUaydgkabfNuogC@metro.proxy.rlwy.net:10759/railway',
  ssl: { rejectUnauthorized: false }
});

async function seed() {
  const hash = await bcrypt.hash('admin123', 12);
  
  await pool.query(`
    INSERT INTO blog_authors (name, email, password_hash, role, bio, initials, avatar_color, is_admin)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (email) DO UPDATE SET password_hash = $3, is_admin = $8
  `, [
    'Amit B',
    'amit@optionslab.in',
    hash,
    'Senior Analyst',
    'Founder of OptionsLab. NIFTY derivatives specialist.',
    'AB',
    '#ff9f0a',
    true
  ]);

  console.log('✅ Admin author created!');
  console.log('   Login: amit@optionslab.in');
  console.log('   Password: admin123');
  console.log('   URL: https://www.optionslab.in/blog/login');
  await pool.end();
}

seed().catch(e => { console.error('ERROR:', e.message); pool.end(); });
