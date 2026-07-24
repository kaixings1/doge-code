const fs=require('fs'); 
const s=fs.readFileSync('src/main.tsx','utf8'); 
const a=s.indexOf('launchRepl('); 
const b=s.indexOf('renderAndRun'); 
let out='=== launchRepl( call ===\n'+s.substring(a-200,a+400)+'\n\n=== renderAndRun ===\n'+s.substring(b-300,b+600); 
fs.writeFileSync('_main.txt',out); 
