  
const fs = require(\"fs^\")  
const path = require(\"path^\")  
function scan(dir) {  
  fs.readdirSync(dir).forEach(function(f) {  
    const fp = path.join(dir, f)  
    try {  
      const st = fs.statSync(fp)  
      if (st.isDirectory()) {  
