const fs=require('fs')  
const buf=fs.readFileSync('doge.exe')  
let s=buf.toString()  
const old='d:/trace.txt'  
const newPath='d:/NOOP_TRACE_DISABLED.txt'  
let count=0  
while(s.includes(old)){s=s.split(old).join(newPath);count++}  
console.log('Patched',count,'occurrences of d:/trace.txt')  
if(count,Buffer.from(s));console.log('Written to doge.exe')}  
