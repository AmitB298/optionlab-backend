const fs = require('fs');
let c = fs.readFileSync('src/index.js', 'utf8');
// Replace everything from allowedOrigins to the closing of cors() block
c = c.replace(
  /const allowedOrigins[\s\S]*?\}\)\);/,
  "app.use(cors({ origin: true, credentials: true }));"
);
fs.writeFileSync('src/index.js', c);
console.log('Done');
// Verify
const lines = c.split('\n').slice(18, 38);
lines.forEach((l, i) => console.log((i+19) + ': ' + l));
