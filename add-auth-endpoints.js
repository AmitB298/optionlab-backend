// add-auth-endpoints.js
// Run from: E:\OptionLab\optionlab-backend
// Adds /api/auth/register and /api/auth/login-mpin to auth.routes.js

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'src', 'routes', 'auth.routes.js');
let c = fs.readFileSync(FILE, 'utf8');

// Check if already added
if (c.includes('/register') || c.includes('/login-mpin')) {
  console.log('Endpoints already exist — checking content...');
} else {
  console.log('Adding endpoints...');
}

// The two new endpoints to append before module.exports
const newEndpoints = `

// ─── POST /api/auth/register ──────────────────────────────────────────────────
// Called by register.html: { name, mobile, mpin, clientId }
router.post('/register', async (req, res) => {
  const { name, mobile, mpin, clientId } = req.body || {};

  if (!name || !mobile || !mpin) {
    return res.status(400).json({ success: false, error: 'Name, mobile and MPIN are required' });
  }
  if (!/^[6-9]\\d{9}$/.test(mobile)) {
    return res.status(400).json({ success: false, error: 'Invalid mobile number' });
  }
  if (!/^\\d{4,6}$/.test(mpin)) {
    return res.status(400).json({ success: false, error: 'MPIN must be 4-6 digits' });
  }

  try {
    // Check duplicate mobile
    const existing = await pool.query('SELECT id FROM users WHERE mobile = $1', [mobile]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'Mobile number already registered' });
    }

    const mpinHash = await bcrypt.hash(mpin, 12);

    const result = await pool.query(
      \`INSERT INTO users (name, mobile, mpin_hash, plan, is_active, role, angel_client_code, created_at)
       VALUES ($1, $2, $3, 'FREE', true, 'user', $4, NOW())
       RETURNING id, name, mobile, plan\`,
      [name.trim(), mobile, mpinHash, clientId || null]
    );

    const user = result.rows[0];
    const token = issueJWT(user);

    // Log to admin audit
    pool.query(
      \`INSERT INTO admin_audit_log (action, target_user_id, success, ip_address, created_at)
       VALUES ('user_register', $1, true, $2, NOW())\`,
      [user.id, req.ip]
    ).catch(() => {});

    return res.status(201).json({
      success: true,
      token,
      user: { id: user.id, name: user.name, mobile: user.mobile, plan: user.plan },
    });
  } catch (e) {
    console.error('[auth/register]', e.message);
    return res.status(500).json({ success: false, error: 'Registration failed. Try again.' });
  }
});

// ─── POST /api/auth/login-mpin ────────────────────────────────────────────────
// Called by index.html: { mobile, mpin }
router.post('/login-mpin', userLoginLimiter, async (req, res) => {
  const { mobile, mpin } = req.body || {};

  if (!mobile || !mpin) {
    return res.status(400).json({ success: false, error: 'Mobile and MPIN are required' });
  }
  if (!/^[6-9]\\d{9}$/.test(mobile)) {
    return res.status(400).json({ success: false, error: 'Invalid mobile number' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, name, mobile, mpin_hash, plan, is_active, role FROM users WHERE mobile = $1',
      [mobile]
    );

    const hash   = rows.length ? rows[0].mpin_hash : '$2a$12$invalidhashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
    const mpinOk = await bcrypt.compare(mpin, hash);

    if (!rows.length || !mpinOk || !rows[0].is_active) {
      // Track failed logins
      if (rows.length) {
        pool.query(
          \`UPDATE users SET login_count = COALESCE(login_count, 0) WHERE id = $1\`,
          [rows[0].id]
        ).catch(() => {});
      }
      return res.status(401).json({ success: false, error: 'Invalid mobile or MPIN' });
    }

    const user = rows[0];
    const token = issueJWT(user);

    // Update last login
    pool.query(
      \`UPDATE users SET last_login_at = NOW(), login_count = COALESCE(login_count, 0) + 1 WHERE id = $1\`,
      [user.id]
    ).catch(() => {});

    return res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, mobile: user.mobile, plan: user.plan, role: user.role },
    });
  } catch (e) {
    console.error('[auth/login-mpin]', e.message);
    return res.status(500).json({ success: false, error: 'Login unavailable. Try again.' });
  }
});

`;

// Insert before module.exports line
if (c.includes('module.exports = router;')) {
  c = c.replace('module.exports = router;', newEndpoints + 'module.exports = router;');
  fs.writeFileSync(FILE, c, 'utf8');
  console.log('✓ /register and /login-mpin added to auth.routes.js');
} else {
  // Append at end
  c = c + newEndpoints + '\nmodule.exports = router;\n';
  fs.writeFileSync(FILE, c, 'utf8');
  console.log('✓ Appended to auth.routes.js');
}

// Verify
const verify = fs.readFileSync(FILE, 'utf8');
console.log('\nVerification:');
console.log('  /register found:', verify.includes('/register'));
console.log('  /login-mpin found:', verify.includes('/login-mpin'));