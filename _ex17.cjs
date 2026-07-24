const fs=require('fs'); 
const s=fs.readFileSync('src/main.tsx','utf8'); 
const i=s.indexOf('BEFORE Promise.all commands'); 
fs.writeFileSync('_promises.txt', s.substring(i-300,i+400)); 
