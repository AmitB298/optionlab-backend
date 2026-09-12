'use strict';
/* ════════════════════════════════════════════
   shared.js — OptionsLab common utilities
   Loaded on every page via <script src="/shared.js" defer>
   ════════════════════════════════════════════ */

const API = (typeof window.__API_URL !== 'undefined' && window.__API_URL)
  ? window.__API_URL
  : (window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : window.location.origin);  // Same-origin: backend serves frontend

/* ── DARK MODE ─────────────────────────────────────────────────────────────── */
function toggleDark() {
  const isLight = document.documentElement.classList.toggle('light-mode');
  localStorage.setItem('ol_theme', isLight ? 'light' : 'dark');
  document.querySelectorAll('.btn-icon').forEach(b => {
    if (b.textContent === '🌙' || b.textContent === '☀️')
      b.textContent = isLight ? '☀️' : '🌙';
  });
}

/* Apply saved theme immediately (before paint) */
if (localStorage.getItem('ol_theme') === 'light') {
  document.documentElement.classList.add('light-mode');
}

/* ── AUTH-AWARE NAV ────────────────────────────────────────────────────────── */
/* Fix #8: Check cookie/session and swap "Sign In" → "Dashboard" if logged in */
async function updateNavAuth() {
  try {
    // Check both httpOnly cookie (new) and localStorage token (existing app.html style)
    const localToken = localStorage.getItem('OptionsLab_token') || localStorage.getItem('ol_token');
    const headers = localToken ? { 'Authorization': `Bearer ${localToken}` } : {};
    const r = await fetch(`${API}/api/auth/validate`, {
      credentials: 'include',
      headers,
      signal: AbortSignal.timeout ? AbortSignal.timeout(3000) : (() => {
        const c = new AbortController();
        setTimeout(() => c.abort(), 3000);
        return c.signal;
      })()
    });

    if (r.ok) {
      const data = await r.json();
      const name = data.user?.name || data.user?.mobile || 'Account';
      const first = name.split(' ')[0];

      /* Swap every "Sign In" link to "Dashboard" */
      document.querySelectorAll('a.btn-signin').forEach(el => {
        el.href = '/app';
        el.textContent = first + ' →';
        el.style.color = 'var(--orange)';
      });

      /* Mark profile nav button active if on dashboard */
      if (window.location.pathname === '/dashboard') {
        document.querySelectorAll('.bnav-btn').forEach(b => {
          if (b.href && b.href.includes('/dashboard')) b.classList.add('active');
        });
      }
    }
  } catch (e) {
    /* Not logged in or network error — keep default "Sign In" */
  }
}

/* ── BOTTOM NAV ACTIVE STATE ───────────────────────────────────────────────── */
/* Fix #7: Auto-highlight correct bottom nav item based on current URL */
function setNavActive() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.bnav-btn').forEach(btn => {
    btn.classList.remove('active');
    const href = btn.getAttribute('href');
    if (!href) return;
    const btnPath = href.replace(/\/$/, '') || '/';
    if (path === btnPath || (btnPath !== '/' && path.startsWith(btnPath))) {
      btn.classList.add('active');
    }
  });
}

/* Apply sun icon if light mode was saved */
document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('ol_theme') === 'light') {
    document.querySelectorAll('.btn-icon').forEach(b => {
      if (b.textContent === '🌙') b.textContent = '☀️';
    });
  }
  setNavActive();
  updateNavAuth();
});
