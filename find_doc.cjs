const fs = require('fs');
const path = require('path');
const c = fs.readFileSync(path.resolve(__dirname, 'desktop/dist/main/index.mjs'), 'utf8');
let pos = 0;
let count = 0;
while ((pos = c.indexOf('document', pos)) !== -1 && count < 5) {
  count++;
  const snippet = c.substring(Math.max(0, pos - 80), pos + 80).replace(/\n/g, ' ');
  console.log('Occurrence ' + count + ' at char ' + pos + ': ...' + snippet + '...');
  pos += 80;
}
