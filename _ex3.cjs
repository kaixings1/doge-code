const fs=require('fs'); 
const s=fs.readFileSync('.github/ChinaSiro-claude-code-sourcemap/package/cli.js','utf8'); 
const idx=[]; 
let p=s.indexOf('claude-in-chrome-mcp'); 
while(p!==-1){idx.push(p);p=s.indexOf('claude-in-chrome-mcp',p+1);if(idx.length 
let out=''; 
for(const i of idx){out+='\n=== pos '+i+' ===\n';out+=s.substring(i-400,i+400)+'\n'} 
fs.writeFileSync('_mcp.txt',out); 
