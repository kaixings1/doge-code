const fs=require('fs'); 
const s=fs.readFileSync('src/ink/ink.tsx','utf8'); 
const i=s.indexOf('new Ink('); 
fs.writeFileSync('_inkroot.txt', s.substring(i-50,i+250)); 
