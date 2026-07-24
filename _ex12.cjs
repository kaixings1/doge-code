const fs=require('fs'); 
const s=fs.readFileSync('src/main.tsx','utf8'); 
const i=s.indexOf('await launchRepl'); 
fs.writeFileSync('_launch.txt', s.substring(i-600,i+200)); 
