const fs = require('fs');
let c = fs.readFileSync('public/index.html', 'utf8');

const css = '@media(max-width:768px){' +
  '.strategy-lab{grid-template-columns:1fr!important;gap:.5rem!important;}' +
  '.strategy-builder{height:auto!important;padding:.75rem!important;}' +
  '.strategy-presets{gap:.25rem!important;margin-bottom:.5rem!important;}' +
  '.preset-btn{font-size:.6rem!important;padding:.22rem .45rem!important;}' +
  '.leg-row{grid-template-columns:52px 44px 72px 44px!important;font-size:.55rem!important;gap:.15rem!important;padding:.15rem .2rem!important;}' +
  '.leg-select,.leg-input{font-size:.55rem!important;padding:.1rem .15rem!important;}' +
  '.add-leg-btn{font-size:.6rem!important;padding:.25rem!important;}' +
  '.calc-btn{font-size:.7rem!important;padding:.4rem!important;margin-bottom:.5rem!important;}' +
  '.payoff-stats{grid-template-columns:1fr 1fr!important;gap:.3rem!important;}' +
  '.ps-val{font-size:.9rem!important;}' +
  '.greeks-canvas-grid{grid-template-columns:1fr 1fr!important;}' +
  '#payoffCanvas{height:200px!important;}' +
  '.chart-card{margin-bottom:.5rem!important;}' +
'}';

const idx = c.lastIndexOf('</style>');
if (idx === -1) { console.log('ERROR: </style> not found'); process.exit(1); }

c = c.slice(0, idx) + css + '</style>' + c.slice(idx + 8);
fs.writeFileSync('public/index.html', c);
console.log('done');