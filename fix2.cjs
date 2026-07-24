var fs=require('fs')  
var f='D:/OpenSourceGit/Chat2API/test_conn.cjs'  
var s=fs.readFileSync(f,'utf8')  
s=s.replace(\"l.startsWith('Oasis-Token=' &&\",\"l.startsWith('Oasis-Token=') &&\")  
s=s.replace(\"l.startsWith('Oasis-Webid=' &&\",\"l.startsWith('Oasis-Webid=') &&\")  
fs.writeFileSync(f,s)  
console.log('fixed')  
