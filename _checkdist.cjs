const fs=require('fs');  
const s=fs.readFileSync('dist/cli.js','utf8');  
const lines=s.split(/\r?\n/);  
