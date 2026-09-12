const fs = require('fs');
let c = fs.readFileSync('public/index.html', 'utf8');

// Remove ALL existing 768px media queries
c = c.replace(/@media\(max-width:768px\)\{[^@]*?\}/g, '');

// Count to verify
const remaining = (c.match(/@media\(max-width:768px\)/g) || []).length;
console.log('Remaining media queries after cleanup:', remaining);

// Now add ONE clean fix
const css = '@media(max-width:768px){' +
  '.strategy-lab{grid-template-columns:1fr!important;gap:.75rem!important;}' +
  '.strategy-builder{height:auto!important;padding:.75rem!important;}' +
  '.strategy-presets{display:flex!important;flex-wrap:wrap!important;gap:.3rem!important;margin-bottom:.6rem!important;}' +
  '.preset-btn{font-size:.62rem!important;padding:.25rem .5rem!important;}' +
  '.leg-row{grid-template-columns:50px 42px 70px 42px!important;font-size:.58rem!important;gap:.2rem!important;padding:.18rem .25rem!important;}' +
  '.leg-select,.leg-input{font-size:.58rem!important;padding:.12rem .15rem!important;}' +
  '.add-leg-btn{font-size:.62rem!important;padding:.28rem!important;margin-top:.3rem!important;}' +
  '.calc-btn{font-size:.72rem!important;padding:.45rem!important;margin-bottom:.5rem!important;}' +
  '.payoff-stats{grid-template-columns:1fr 1fr!important;gap:.35rem!important;margin-top:.5rem!important;}' +
  '.ps-val{font-size:.95rem!important;}' +
  '.ps-lbl{font-size:.42rem!important;}' +
  '.greeks-canvas-grid{grid-template-columns:1fr 1fr!important;}' +
  '#payoffCanvas{height:200px!important;}' +
'}';

const idx = c.lastIndexOf('</style>');
c = c.slice(0, idx) + css + '</style>' + c.slice(idx + 8);
fs.writeFileSync('public/index.html', c);
console.log('done');