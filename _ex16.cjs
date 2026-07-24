const fs=require('fs'); 
const s=fs.readFileSync('src/main.tsx','utf8'); 
const i=s.indexOf('AFTER getTools'); 
fs.writeFileSync('_afterget.txt', s.substring(i-200,i+600)); 
