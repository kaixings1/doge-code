const fs = require('fs');
const content = fs.readFileSync('src/tools/WebFetchTool/preapproved.ts', 'utf8');
const lines = content.split('\n');
const domains = [];
for (const line of lines) {
  const match = line.match(/^  '([^']+)',$/);
  if (match) domains.push(match[1]);
}
const seen = new Map();
const dups = [];
for (const d of domains) {
  if (seen.has(d)) dups.push(d);
  seen.set(d, true);
}
if (dups.length === 0) {
  console.log('No duplicates found!');
} else {
  console.log('Duplicates:', dups);
}
console.log('Total domains:', domains.length);
