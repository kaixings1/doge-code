const fs=require('fs'); 
const s=fs.readFileSync('.github/ChinaSiro-claude-code-sourcemap/package/cli.js','utf8'); 
const i=s.indexOf('Extension not found in any browser'); 
fs.writeFileSync('_ctx2.txt', s.substring(i+500, i+4000)); 
