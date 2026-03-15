const fs = require('fs');
let c = fs.readFileSync('public/admin.html', 'utf8');

// 1. maxlength on login input
c = c.replace(/(id="l-mpin"[^>]*)maxlength="\d+"/, '$1maxlength="20"');

// 2. Login validation: mpin.length < 4 -> < 1  
c = c.replace("mpin.length < 4", "mpin.length < 1");

// 3. Reset MPIN validation: mpin.length !== 4
c = c.replace("mpin.length !== 4", "mpin.length < 1");

// 4. Any remaining "4-digit MPIN" text in validation messages
c = c.replace(/4-digit MPIN/g, 'MPIN');

fs.writeFileSync('public/admin.html', c);
console.log('Done');

// Verify
const lines = c.split('\n');
lines.forEach((l, i) => { if (l.includes('mpin') && (l.includes('length') || l.includes('maxlength'))) console.log((i+1) + ': ' + l.trim()); });
