const fs=require('fs'); 
const s=fs.readFileSync('debug_fix1.txt','utf8'); 
fs.writeFileSync('_lastdbg.txt', s.slice(-5000)); 
