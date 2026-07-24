const fs=require('fs'); 
const s=fs.readFileSync('src/main.tsx','utf8'); 
const i=s.indexOf('AFTER Promise.all commands'); 
fs.writeFileSync('_afterpromise.txt', s.substring(i+10, i+1200)); 
