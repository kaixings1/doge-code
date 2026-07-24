const fs = require('fs')  
const path = require('path')  
function findTraceCode(dir) {  
  fs.readdirSync(dir).forEach(f = 
    const fp = path.join(dir, f)  
    const st = fs.statSync(fp)  
    if (st.isDirectory()) {  
