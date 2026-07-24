const fs = require('fs')  
  
let s = fs.readFileSync('src/ink/components/App.tsx', 'utf8')  
s = s.replace(\"} catch(e) {} undefined, _unused2: undefined): void {\", \"} catch(e) {}\")  
fs.writeFileSync('src/ink/components/App.tsx', s)  
console.log('fixed')  
