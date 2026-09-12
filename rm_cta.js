const fs = require('fs');
let c = fs.readFileSync('public/index.html', 'utf8');

// Find and remove the GET ACCESS button - try different patterns
const before = c.length;

// Pattern 1: anchor tag with GET ACCESS
c = c.replace(/<a[^>]*class="[^"]*nav-cta[^"]*"[^>]*>.*?GET ACCESS.*?<\/a>/gs, '');

// Pattern 2: button with GET ACCESS  
c = c.replace(/<button[^>]*>.*?GET ACCESS.*?<\/button>/gs, '');

// Pattern 3: any element with nav-cta class containing GET ACCESS
c = c.replace(/<[^>]+class="[^"]*get-access[^"]*"[^>]*>.*?<\/[^>]+>/gs, '');

const after = c.length;
console.log('Removed', before - after, 'chars');

if (before === after) {
  // Nothing matched - show context so we can see exact HTML
  const i = c.indexOf('GET ACCESS');
  if (i > -1) console.log('CONTEXT:', c.substring(i-200, i+60));
  else console.log('GET ACCESS not found at all');
} else {
  fs.writeFileSync('public/index.html', c);
  console.log('done');
}