const fs=require('fs')  
const p='src/ink/components/App.tsx'  
const c=fs.readFileSync(p,'utf8')  
const marker='reconciler.discreteUpdates(processKeysInBatch, this, keys, undefined, undefined);'  
const replacement='processKeysInBatch(this, keys);'  
fs.writeFileSync(p, c.replace(marker, replacement))  
console.log('SYNC PATCH OK')  
