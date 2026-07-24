const fs=require('fs'); 
const s=fs.readFileSync('.github/ChinaSiro-claude-code-sourcemap/package/cli.js','utf8'); 
const i=s.indexOf('Extension not found in any browser'); 
fs.writeFileSync('_ctx.txt', s.substring(Math.max(0,i-1500), i+1500)); 
written 
