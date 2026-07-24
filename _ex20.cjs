const fs=require('fs'); 
const s=fs.readFileSync('.github/ChinaSiro-claude-code-sourcemap/package/cli.js','utf8'); 
const idx=[];let p=0;while((p=s.indexOf('i37(',p))!==-1){idx.push(p);p++;if(idx.length;} 
let out='';for(const i of idx){out+='\n=== pos '+i+' ===\n'+s.substring(i-100,i+200)+'\n'} 
fs.writeFileSync('_i37calls.txt',out); 
