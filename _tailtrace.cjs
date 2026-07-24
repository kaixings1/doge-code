const fs=require('fs'); 
const s=fs.readFileSync('d:/trace.log','utf8'); 
const lines=s.trim().split('\n'); 
fs.writeFileSync('_lasttrace.txt', lines.slice(-30).join('\n')); 
