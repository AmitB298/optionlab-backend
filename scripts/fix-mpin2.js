const fs = require('fs');
let c = fs.readFileSync('public/admin.html', 'utf8');

// Fix ALL maxlength="4" on password/mpin inputs
c = c.replace(/(id="lg-mpin"[^>]*)maxlength="\d+"/g, '$1maxlength="20"');
c = c.replace(/(id="new-mpin"[^>]*)maxlength="\d+"/g, '$1maxlength="20"');
c = c.replace(/(id="l-mpin"[^>]*)maxlength="\d+"/g, '$1maxlength="20"');

fs.writeFileSync('public/admin.html', c);
console.log('Done');

// Verify - show all mpin-related lines
const lines = c.split('\n');
lines.forEach((l, i) => {
  if (l.includes('mpin') && (l.includes('maxlength') || l.includes('length')))
    console.log((i+1) + ': ' + l.trim().substring(0, 100));
});
