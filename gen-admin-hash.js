// gen-admin-hash.js
// Run: node gen-admin-hash.js
// Then copy the hash and insert into database

const bcrypt = require('bcryptjs');

// ← CHANGE THIS to your real MPIN (4-6 digits)
const MPIN = '1234';

bcrypt.hash(MPIN, 12).then(hash => {
  console.log('\n=== ADMIN SETUP ===');
  console.log('MPIN:', MPIN);
  console.log('Hash:', hash);
  console.log('\nRun this SQL in Railway → Postgres → Query:');
  console.log(`
INSERT INTO admins (name, mobile, mpin_hash, is_active)
VALUES ('Amit Banerjee', '9811199900', '${hash}', true)
ON CONFLICT (mobile) DO UPDATE SET mpin_hash = '${hash}', is_active = true;
  `);
  console.log('Then go to: https://web-production-8a8e1.up.railway.app/admin');
});