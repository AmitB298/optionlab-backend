'use strict';
/**
 * monitoring/sentry.js — Error monitoring
 *
 * Uses Sentry if SENTRY_DSN is set.
 * Falls back to console logging if not configured.
 * Zero breaking change — if Sentry is not configured, everything works as before.
 *
 * Setup:
 *   1. Create free account at sentry.io
 *   2. Create a Node.js project
 *   3. Copy the DSN and set SENTRY_DSN env var on Railway
 *   4. Done — errors, unhandled rejections, slow requests all captured automatically
 */

let Sentry = null;

function init(app) {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.log('[monitoring] SENTRY_DSN not set — Sentry disabled. Set it on Railway to enable error tracking.');
    return;
  }

  try {
    Sentry = require('@sentry/node');

    Sentry.init({
      dsn,
      environment:      process.env.NODE_ENV || 'development',
      tracesSampleRate: 0.1,   // 10% of requests for performance monitoring
      // Don't send 4xx client errors — only real server errors
      beforeSend(event) {
        if (event.exception) {
          const values = event.exception.values || [];
          for (const ex of values) {
            // Skip expected client errors
            const skip = ['Invalid token', 'No token', 'Not authenticated',
                          'Account suspended', 'User not found'];
            if (skip.some(s => ex.value && ex.value.includes(s))) return null;
          }
        }
        return event;
      },
    });

    // Attach request handler (must be first middleware)
    if (app) {
      app.use(Sentry.Handlers.requestHandler());
      app.use(Sentry.Handlers.tracingHandler());
    }

    console.log('[monitoring] Sentry initialized ✓');
  } catch (e) {
    console.warn('[monitoring] Sentry package not installed. Run: npm install @sentry/node');
    console.warn('[monitoring] Continuing without error tracking.');
    Sentry = null;
  }
}

// Attach error handler (must be last middleware, before 404)
function errorHandler(app) {
  if (!Sentry || !app) return;
  try {
    app.use(Sentry.Handlers.errorHandler());
  } catch (e) {}
}

// Manual error capture (use in catch blocks for critical paths)
function captureError(err, context) {
  if (!err) return;

  // Always log to console
  console.error('[error]', context || '', err.message || err);

  // Send to Sentry if available
  if (Sentry) {
    try {
      Sentry.withScope(scope => {
        if (context) scope.setTag('context', context);
        Sentry.captureException(err);
      });
    } catch (e) {}
  }
}

// Capture custom events (e.g. payment failures, suspicious activity)
function captureEvent(message, level, extra) {
  if (Sentry) {
    try {
      Sentry.captureMessage(message, {
        level: level || 'info',
        extra: extra || {},
      });
    } catch (e) {}
  }
  console.log(`[event:${level || 'info'}]`, message, extra || '');
}

// Health check — returns Sentry status
function status() {
  return {
    enabled:     !!Sentry,
    dsn_set:     !!process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
  };
}

module.exports = { init, errorHandler, captureError, captureEvent, status };
