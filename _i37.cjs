const fs=require('fs'); 
const s=fs.readFileSync('.github/ChinaSiro-claude-code-sourcemap/package/cli.js','utf8'); 
const positions=[];let p=s.indexOf('i37(');while(p!==-1){positions.push(p);p=s.indexOf('i37(',p+1);if(positions.length 
