'use strict';
/**
 * src/validate.js
 *
 * Adapter that exposes named validator functions used by the uploaded
 * auth.routes.js. Delegates to the canonical lib/validate.js.
 *
 * Uploaded auth.routes.js uses:
 *   const { validateMobile, validateMpin, validateName, validateAngelId } = require('../validate');
 */
const V = require('./lib/validate');

function validateMobile(raw) { return V.mobile(raw); }
function validateMpin(raw)   { return V.mpin(raw);   }
function validateAngelId(raw){ return V.angelOneId(raw); }

function validateName(raw) {
  const r = V.text(raw, { maxLen: 100, required: true });
  if (!r.ok) return { ok: false, error: r.error || 'Name is required' };
  return { ok: true, value: r.value };
}

module.exports = { validateMobile, validateMpin, validateName, validateAngelId };
