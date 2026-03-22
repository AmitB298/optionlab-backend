// node test-and-seed-railway.js
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const RAILWAY_URL = 'https://web-production-8a8e1.up.railway.app';

// Railway DB - using external connection string
// DB_HOST=postgres.railway.internal is internal only, need the public URL
// We'll test via HTTP instead

async function testHttp() {
  console.log('=== TESTING RAILWAY HTTP ENDPOINTS ===\n');

  // Test 1: status
  try {
    const r = await fetch(`${RAILWAY_URL}/api/app/status`, { signal: AbortSignal.timeout(8000) });
    console.log('GET /api/app/status:', r.status);
    const d = await r.json().catch(() => ({}));
    console.log('Response:', JSON.stringify(d).slice(0, 200));
  } catch (e) {
    console.log('GET /api/app/status FAILED:', e.message);
  }

  // Test 2: login-mpin with test user
  try {
    const r = await fetch(`${RAILWAY_URL}/api/auth/login-mpin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: '9999999999', mpin: '123456' }),
      signal: AbortSignal.timeout(8000),
    });
    console.log('\nPOST /api/auth/login-mpin:', r.status);
    const d = await r.json().catch(() => ({}));
    console.log('Response:', JSON.stringify(d).slice(0, 300));
  } catch (e) {
    console.log('\nPOST /api/auth/login-mpin FAILED:', e.message);
  }

  // Test 3: register - create the user on Railway
  console.log('\n=== TRYING TO REGISTER USER ON RAILWAY ===');
  try {
    const r = await fetch(`${RAILWAY_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile: '9999999999',
        mpin: '123456',
        email: 'amit@optionslab.in',
        name: 'Amit',
      }),
      signal: AbortSignal.timeout(8000),
    });
    console.log('POST /api/auth/register:', r.status);
    const d = await r.json().catch(() => ({}));
    console.log('Response:', JSON.stringify(d).slice(0, 300));
  } catch (e) {
    console.log('POST /api/auth/register FAILED:', e.message);
  }

  // Test 4: try login again after registration
  console.log('\n=== RETRYING LOGIN AFTER REGISTER ===');
  try {
    const r = await fetch(`${RAILWAY_URL}/api/auth/login-mpin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: '9999999999', mpin: '123456' }),
      signal: AbortSignal.timeout(8000),
    });
    console.log('POST /api/auth/login-mpin:', r.status);
    const d = await r.json().catch(() => ({}));
    console.log('Response:', JSON.stringify(d).slice(0, 300));
    if (d.success) {
      console.log('\n✅ LOGIN WORKS! Token:', d.token?.slice(0, 30) + '...');
    }
  } catch (e) {
    console.log('FAILED:', e.message);
  }
}

testHttp();
