/**
 * add-live-users-panel.js
 * Adds a "Live Users" page to admin.html showing app_sessions data
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'public', 'admin.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// ─── 1. Add nav item ──────────────────────────────────────────────────────────
const navInsertAfter = `      <div class="nav-section">Users</div>`;
const newNavItem = `      <div class="nav-section">Users</div>
      <div class="nav-item" onclick="showPage('page-live')" data-page="page-live">
        <span class="ni">◉</span> Live Users
      </div>`;

if (!html.includes("page-live")) {
  html = html.replace(navInsertAfter, newNavItem);
  console.log('✓ Added Live Users nav item');
} else {
  console.log('✓ Nav item already exists');
}

// ─── 2. Add page title mapping ────────────────────────────────────────────────
html = html.replace(
  `'page-audit':'AUDIT LOG'`,
  `'page-live':'LIVE USERS','page-audit':'AUDIT LOG'`
);

// ─── 3. Add the Live Users page HTML ─────────────────────────────────────────
const livePageHtml = `
      <!-- ── LIVE USERS ── -->
      <div class="page" id="page-live">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <div>
            <div style="font-family:'Bebas Neue',sans-serif;font-size:13px;letter-spacing:0.1em;color:var(--muted)">JOBBER APP</div>
            <div style="font-size:11px;color:var(--muted);font-family:'IBM Plex Mono',monospace;margin-top:4px">
              Users active in last <span style="color:var(--green)">5 minutes</span> are shown as online
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="loadLiveUsers()">⟳ Refresh</button>
        </div>

        <!-- Summary cards -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px">
          <div class="stat-card green">
            <div class="stat-label">Online Now</div>
            <div class="stat-val" id="live-online">—</div>
            <div class="stat-sub">Active &lt; 5 min</div>
          </div>
          <div class="stat-card amber">
            <div class="stat-label">Active Today</div>
            <div class="stat-val" id="live-today">—</div>
            <div class="stat-sub">Heartbeat today</div>
          </div>
          <div class="stat-card blue">
            <div class="stat-label">Market Connected</div>
            <div class="stat-val" id="live-market">—</div>
            <div class="stat-sub">Angel One linked</div>
          </div>
          <div class="stat-card red">
            <div class="stat-label">Never Connected</div>
            <div class="stat-val" id="live-never">—</div>
            <div class="stat-sub">No heartbeat yet</div>
          </div>
        </div>

        <!-- Live users table -->
        <div class="card">
          <div class="card-head">
            <div class="card-title">App Sessions</div>
            <div style="font-size:11px;font-family:'IBM Plex Mono',monospace;color:var(--muted)" id="live-updated">—</div>
          </div>
          <div class="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Mobile</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>App Version</th>
                  <th>Platform</th>
                  <th>Market</th>
                  <th>Last Seen</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody id="live-body">
                <tr><td colspan="9" style="text-align:center;color:var(--muted);padding:32px">Loading...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Users who registered but never opened the app -->
        <div class="card">
          <div class="card-head">
            <div class="card-title">Registered — App Never Opened</div>
            <div style="font-size:11px;font-family:'IBM Plex Mono',monospace;color:var(--muted)">Users who signed up but haven't launched Jobber yet</div>
          </div>
          <div class="tbl-wrap">
            <table>
              <thead><tr><th>User</th><th>Mobile</th><th>Plan</th><th>Registered</th></tr></thead>
              <tbody id="never-body">
                <tr><td colspan="4" style="text-align:center;color:var(--muted);padding:24px">Loading...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>`;

// Insert before the closing of the content div
html = html.replace(
  `    </div><!-- /content -->`,
  livePageHtml + `\n    </div><!-- /content -->`
);
console.log('✓ Added Live Users page HTML');

// ─── 4. Add the JS function ───────────────────────────────────────────────────
const liveJs = `
// ══════════════════════════════════════════════════════════
// LIVE USERS
// ══════════════════════════════════════════════════════════
async function loadLiveUsers() {
  const data = await api('/live-users');
  if (!data) return;

  const sessions  = data.sessions  || [];
  const never     = data.never     || [];
  const stats     = data.stats     || {};

  // Update stat cards
  document.getElementById('live-online').textContent  = stats.online  ?? '—';
  document.getElementById('live-today').textContent   = stats.today   ?? '—';
  document.getElementById('live-market').textContent  = stats.market  ?? '—';
  document.getElementById('live-never').textContent   = never.length  ?? '—';
  document.getElementById('live-updated').textContent = 'Updated ' + new Date().toLocaleTimeString('en-IN');

  // Sessions table
  const tbody = document.getElementById('live-body');
  if (!sessions.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:32px">No app sessions yet</td></tr>';
  } else {
    const now = Date.now();
    tbody.innerHTML = sessions.map(s => {
      const lastMs   = s.last_seen_at ? new Date(s.last_seen_at).getTime() : 0;
      const diffMin  = Math.floor((now - lastMs) / 60000);
      const isOnline = diffMin < 5;
      return \`<tr>
        <td style="font-weight:600">\${esc(s.name || '—')}</td>
        <td class="td-mono">\${esc(s.mobile)}</td>
        <td>\${planBadge(s.plan)}</td>
        <td>
          \${isOnline
            ? '<span class="badge badge-green"><span class="dot dot-green"></span>Online</span>'
            : \`<span class="badge badge-muted">\${diffMin < 60 ? diffMin+'m ago' : fmtDate(s.last_seen_at)}</span>\`}
        </td>
        <td class="td-mono" style="color:var(--amber)">\${esc(s.app_version || '—')}</td>
        <td class="td-mono" style="color:var(--muted)">\${esc(s.platform || '—')}</td>
        <td>
          \${s.is_market_connected
            ? '<span class="badge badge-green">✓ Connected</span>'
            : '<span class="badge badge-muted">—</span>'}
        </td>
        <td class="td-mono" style="color:var(--muted)">\${s.last_seen_at ? fmtDate(s.last_seen_at) : '—'}</td>
        <td class="td-mono" style="color:var(--muted);font-size:11px">\${esc(s.ip_address || '—')}</td>
      </tr>\`;
    }).join('');
  }

  // Never opened table
  const nbody = document.getElementById('never-body');
  if (!never.length) {
    nbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:24px">All registered users have opened the app ✓</td></tr>';
  } else {
    nbody.innerHTML = never.map(u => \`<tr>
      <td style="font-weight:600;cursor:pointer" onclick="openUser(\${u.id})">\${esc(u.name || '—')}</td>
      <td class="td-mono">\${esc(u.mobile)}</td>
      <td>\${planBadge(u.plan)}</td>
      <td class="td-mono" style="color:var(--muted)">\${fmtDate(u.created_at)}</td>
    </tr>\`).join('');
  }
}
`;

// Insert the JS before the closing script tag
html = html.replace(
  `// Close modals on bg click`,
  liveJs + `\n// Close modals on bg click`
);
console.log('✓ Added loadLiveUsers() JS function');

// ─── 5. Auto-load live users when page shown ──────────────────────────────────
html = html.replace(
  `function showPage(id) {`,
  `function showPage(id) {
  if (id === 'page-live') loadLiveUsers();`
);

// ─── 6. Add to showShell() so it loads on login ───────────────────────────────
html = html.replace(
  `  loadAnnouncements();`,
  `  loadAnnouncements();
  loadLiveUsers();`
);

// ─── 7. Write file ────────────────────────────────────────────────────────────
fs.writeFileSync(htmlPath, html, 'utf8');
console.log('✓ admin.html updated');

// ─── 8. Now add the backend API endpoint to admin.routes.js ──────────────────
const adminRoutesPath = path.join(__dirname, 'src', 'routes', 'admin.routes.js');
let adminRoutes = fs.readFileSync(adminRoutesPath, 'utf8');

if (adminRoutes.includes('/live-users')) {
  console.log('✓ /live-users already in admin.routes.js');
} else {
  const liveUsersRoute = `
// ─── GET /api/admin/live-users ────────────────────────────────────────────────
// Shows app_sessions joined with users — who is online in Jobber app
router.get('/live-users', async (req, res) => {
  try {
    // All users with an app session
    const sessions = await pool.query(\`
      SELECT
        u.id, u.name, u.mobile, u.plan,
        s.app_version, s.platform, s.is_market_connected,
        s.last_seen_at, s.ip_address
      FROM app_sessions s
      JOIN users u ON u.id = s.user_id
      ORDER BY s.last_seen_at DESC NULLS LAST
    \`);

    // Users who registered but never sent a heartbeat
    const never = await pool.query(\`
      SELECT u.id, u.name, u.mobile, u.plan, u.created_at
      FROM users u
      WHERE u.id NOT IN (SELECT user_id FROM app_sessions)
      ORDER BY u.created_at DESC
    \`);

    // Stats
    const now = new Date();
    const fiveMinAgo = new Date(now - 5 * 60 * 1000);
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0);

    const online = sessions.rows.filter(s => s.last_seen_at && new Date(s.last_seen_at) > fiveMinAgo).length;
    const today  = sessions.rows.filter(s => s.last_seen_at && new Date(s.last_seen_at) > todayStart).length;
    const market = sessions.rows.filter(s => s.is_market_connected).length;

    return res.json({
      success: true,
      sessions: sessions.rows,
      never:    never.rows,
      stats: { online, today, market },
    });
  } catch (err) {
    console.error('[live-users]', err.message);
    return res.status(500).json({ error: 'Database operation failed' });
  }
});

`;

  // Insert before the module.exports
  adminRoutes = adminRoutes.replace('module.exports = router;', liveUsersRoute + 'module.exports = router;');
  fs.writeFileSync(adminRoutesPath, adminRoutes, 'utf8');
  console.log('✓ Added /live-users route to admin.routes.js');
}

console.log('\n✅ All done! Run:');
console.log('git add -A && git commit -m "feat: Live Users panel in admin dashboard" && git push');