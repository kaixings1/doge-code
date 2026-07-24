const fs = require('fs'); 
const f = fs.readFileSync('src/ink/components/App.tsx', 'utf8'); 
const oldLine = 'reconciler.discreteUpdates(processKeysInBatch, this, keys, undefined, undefined);'; 
const newLine = 'processKeysInBatch(this, keys);'; 
if (f.includes(oldLine)) { 
  fs.writeFileSync('src/ink/components/App.tsx', f.replace(oldLine, newLine), 'utf8'); 
  console.log('Patched App.tsx'); 
} else { console.log('Already patched or not found'); } 
