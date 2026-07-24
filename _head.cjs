const fs=require('fs'); 
const s=fs.readFileSync('debug_fix1.txt','utf8'); 
fs.writeFileSync('_head.txt', s.substring(0,8000)); 
