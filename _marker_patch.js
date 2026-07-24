// PATCH  
const fs = require('fs')  
const p = 'src/ink/components/App.tsx'  
const c = fs.readFileSync(p, 'utf8')  
const search = 'processKeysInBatch(this, keys, undefined, undefined);'  
if (!c.includes(search)) { console.log('MARKER NOT FOUND'); process.exit(1); }  
