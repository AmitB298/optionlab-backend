const fs = require('fs');
const c = fs.readFileSync('public/index.html', 'utf8');
// Find the HTML div, not the CSS class
const marker = 'class="strategy-lab">';
const i = c.indexOf(marker);
if (i === -1) { console.log('NOT FOUND'); process.exit(1); }
console.log(c.substring(i, i + 3000));