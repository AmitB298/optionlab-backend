'use strict';

/**
 * routes/fii.routes.js
 *
 * Proxy for NSE's public EOD FII/DII trade data.
 * Source: NSE official API — public regulatory disclosure (SEBI mandated).
 * This is NOT scraping — NSE publishes this data as a public obligation.
 *
 * GET /api/fii/data        → today's FII/DII cash + F&O flow
 * GET /api/fii/history     → last 30 days of FII/DII data
 *
 * No auth required — public data, public endpoint.
 * In-memory cache: 1 hour (NSE updates once after market close ~6:30 PM).
 */

const express = require('express');
const router  = express.Router();
const https   = require('https');

// ── In-memory cache ─────────────────────────────────────────────────────────
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = {
  data:    null,
  history: null,
  dataAt:    0,
  historyAt: 0,
};

// ── NSE fetch helper ─────────────────────────────────────────────────────────
// NSE requires specific headers — without them it returns 401/403
function nseGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.nseindia.com',
      path,
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':          'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer':         'https://www.nseindia.com/market-data/fii-dii-activity',
        'Connection':      'keep-alive',
        'sec-ch-ua':       '"Not_A Brand";v="8", "Chromium";v="120"',
        'sec-ch-ua-mobile':'?0',
        'sec-ch-ua-platform': '"Windows"',
        'Sec-Fetch-Dest':  'empty',
        'Sec-Fetch-Mode':  'cors',
        'Sec-Fetch-Site':  'same-origin',
      },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      // Handle gzip/br if needed
      let stream = res;
      if (res.headers['content-encoding'] === 'gzip') {
        const zlib = require('zlib');
        stream = res.pipe(zlib.createGunzip());
      } else if (res.headers['content-encoding'] === 'br') {
        const zlib = require('zlib');
        stream = res.pipe(zlib.createBrotliDecompress());
      }
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode, body });
        } catch (e) {
          reject(e);
        }
      });
      stream.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('NSE request timed out')); });
    req.end();
  });
}

// ── Parse NSE FII/DII response ───────────────────────────────────────────────
// NSE returns an array of objects with category, buyValue, sellValue, netValue
function parseNseData(raw) {
  // NSE API returns: [{ category, buyValue, sellValue, netValue }, ...]
  // Categories: "FII/FPI", "DII", "Pro", "Client" etc.
  const rows = Array.isArray(raw) ? raw : (raw.data || raw.fiiDii || []);

  const find = (keyword) =>
    rows.find((r) =>
      r.category && r.category.toUpperCase().includes(keyword.toUpperCase())
    ) || null;

  const parse = (row) => {
    if (!row) return null;
    return {
      buy:  parseFloat((row.buyValue  || row.buy  || '0').toString().replace(/,/g, '')),
      sell: parseFloat((row.sellValue || row.sell || '0').toString().replace(/,/g, '')),
      net:  parseFloat((row.netValue  || row.net  || '0').toString().replace(/,/g, '')),
    };
  };

  return {
    fii: parse(find('FII') || find('FPI')),
    dii: parse(find('DII')),
    pro: parse(find('PRO')),
    client: parse(find('CLIENT')),
  };
}

// ── GET /api/fii/data ────────────────────────────────────────────────────────
router.get('/data', async (req, res) => {
  // Serve cache if fresh
  if (cache.data && Date.now() - cache.dataAt < CACHE_TTL_MS) {
    return res.json({ success: true, source: 'cache', ...cache.data });
  }

  try {
    // Primary: NSE FII/DII trade react API
    const { status, body } = await nseGet('/api/fiidiiTradeReact');

    if (status !== 200) {
      throw new Error(`NSE returned HTTP ${status}`);
    }

    const raw = JSON.parse(body);
    const parsed = parseNseData(raw);

    // Date from NSE response or today
    const today = new Date().toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
    });

    const payload = {
      date: raw.date || today,
      cash: parsed,          // FII/DII/PRO/CLIENT cash market
      fo:   null,            // F&O breakdown (separate NSE endpoint — add later)
      // raw removed from payload (not exposed to client)
    };

    // Update cache
    cache.data   = payload;
    cache.dataAt = Date.now();

    return res.json({ success: true, source: 'nse', ...payload });

  } catch (err) {
    console.error('[fii/data] NSE fetch failed:', err.message);

    // If cache exists (even stale), serve it with a warning
    if (cache.data) {
      return res.json({
        success: true,
        source:  'stale-cache',
        stale:   true,
        staleMs: Date.now() - cache.dataAt,
        warning: 'NSE unreachable — serving cached data',
        ...cache.data,
      });
    }

    // Fallback: return mock data so frontend never breaks
    return res.json({
      success: true,
      source:  'fallback',
      stale:   true,
      warning: 'NSE unreachable — mock data',
      date:    new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }),
      cash: {
        fii:    { buy: 12840.5,  sell: 9993.2,  net:  2847.3  },
        dii:    { buy: 8420.1,   sell: 7216.0,  net:  1204.1  },
        pro:    { buy: 6100.0,   sell: 7991.0,  net: -1891.0  },
        client: { buy: 4380.0,   sell: 3639.0,  net:   741.0  },
      },
    });
  }
});

// ── GET /api/fii/history ─────────────────────────────────────────────────────
// NSE history endpoint — last 30 trading days
router.get('/history', async (req, res) => {
  if (cache.history && Date.now() - cache.historyAt < CACHE_TTL_MS) {
    return res.json({ success: true, source: 'cache', history: cache.history });
  }

  try {
    // NSE provides a separate endpoint for historical FII/DII
    // Using a date range — last 30 days
    const toDate   = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 45); // 45 days to ensure 30 trading days

    const fmt = (d) =>
      `${d.getDate().toString().padStart(2,'0')}-${
        ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]
      }-${d.getFullYear()}`;

    const path = `/api/historicalOR-fiidii?from=${fmt(fromDate)}&to=${fmt(toDate)}&type=equities`;
    const { status, body } = await nseGet(path);

    if (status !== 200) throw new Error(`NSE history returned HTTP ${status}`);

    const raw = JSON.parse(body);
    const rows = Array.isArray(raw) ? raw : (raw.data || []);

    // Normalize to { date, fii_net, dii_net }
    const history = rows.slice(0, 30).map((r) => ({
      date:    r.date || r.tradedDate || '',
      fii_net: parseFloat((r.fiiNet || r.FIINet || r.netValue || '0').toString().replace(/,/g, '')),
      dii_net: parseFloat((r.diiNet || r.DIINet || '0').toString().replace(/,/g, '')),
      fii_buy: parseFloat((r.fiiBuy || r.FIIBuy || '0').toString().replace(/,/g, '')),
      fii_sell:parseFloat((r.fiiSell || r.FIISell || '0').toString().replace(/,/g, '')),
    }));

    cache.history   = history;
    cache.historyAt = Date.now();

    return res.json({ success: true, source: 'nse', history });

  } catch (err) {
    console.error('[fii/history] NSE fetch failed:', err.message);

    if (cache.history) {
      return res.json({ success: true, source: 'stale-cache', history: cache.history });
    }

    // Fallback mock history — 12 data points
    const mockHistory = [
      { date: '19-Mar-2026', fii_net:  1200, dii_net:  800 },
      { date: '21-Mar-2026', fii_net: -3400, dii_net: 2900 },
      { date: '25-Mar-2026', fii_net:  2800, dii_net:  400 },
      { date: '27-Mar-2026', fii_net:  4100, dii_net:  600 },
      { date: '01-Apr-2026', fii_net: -2200, dii_net: 3100 },
      { date: '03-Apr-2026', fii_net:  1800, dii_net:  900 },
      { date: '07-Apr-2026', fii_net:  -800, dii_net: 2400 },
      { date: '09-Apr-2026', fii_net:  3200, dii_net:  400 },
      { date: '11-Apr-2026', fii_net:  2100, dii_net: 1200 },
      { date: '14-Apr-2026', fii_net: -1400, dii_net: 4800 },
      { date: '16-Apr-2026', fii_net:   900, dii_net: 2100 },
      { date: '17-Apr-2026', fii_net:  2847, dii_net: 1204 },
    ];

    return res.json({ success: true, source: 'fallback', history: mockHistory });
  }
});

// ── GET /api/fii/status ──────────────────────────────────────────────────────
// Simple health check for this route
router.get('/status', (req, res) => {
  const cacheAge = cache.dataAt ? Math.round((Date.now() - cache.dataAt) / 1000) : null;
  return res.json({
    success:    true,
    cacheReady: !!cache.data,
    cacheAgeS:  cacheAge,
    cacheTtlS:  CACHE_TTL_MS / 1000,
    source:     cache.data ? (cacheAge < CACHE_TTL_MS / 1000 ? 'fresh' : 'stale') : 'empty',
  });
});

module.exports = router;
