const fs = require('fs');
const content = fs.readFileSync('src/tools/WebFetchTool/preapproved.ts', 'utf8');
const lines = content.split('\n');

const output = [];
const seen = new Set();
let inSet = false;

for (const line of lines) {
  if (line.includes('PREAPPROVED_HOSTS = new Set([')) {
    inSet = true;
    output.push(line);
    continue;
  }
  if (inSet && line.trim() === ']);') {
    inSet = false;
    output.push(line);
    continue;
  }
  if (inSet) {
    const match = line.match(/^(  ')([^']+)',$/);
    if (match) {
      const domain = match[2];
      if (!seen.has(domain)) {
        seen.add(domain);
        output.push(match[1] + domain + "',");
      }
      continue;
    }
  }
  output.push(line);
}

fs.writeFileSync('src/tools/WebFetchTool/preapproved.ts', output.join('\n'), 'utf8');
console.log('Deduplication done. Total domains:', seen.size);
