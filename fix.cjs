var fs=require('fs')  
var f='D:/OpenSourceGit/Chat2API/test_conn.cjs'  
var s=fs.readFileSync(f,'utf8')  
s=s.replace(/slice\(0, 11\) === /g,'startsWith(')  
s=s.replace(/l\.slice\(11\)/g,'l.slice(12)')  
fs.writeFileSync(f,s)  
console.log('fixed')  
