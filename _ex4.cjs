const fs=require('fs'); 
const s=fs.readFileSync('.github/ChinaSiro-claude-code-sourcemap/package/cli.js','utf8'); 
const i=s.indexOf('async function oVY'); 
fs.writeFileSync('_oVY.txt', s.substring(i, i+200)+'\n--- CALLERS (search Zs( or ZuK( usage) ---\n'); 
const j=s.indexOf('return ZuK(q,N)'); 
fs.appendFileSync('_oVY.txt', s.substring(j-600, j+200)); 
