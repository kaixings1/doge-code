const fs = require('fs')  
const content = fs.readFileSync('src/utils/toolSearch.ts', 'utf8')  
const marker = '  return true' + String.fromCharCode(10) + '}' + String.fromCharCode(10) + '  try {'  
if (content.includes(marker)) {  
  const fixed = content.replace(marker, '  return true' + String.fromCharCode(10) + '}' + String.fromCharCode(10) + String.fromCharCode(10) + '/**')  
  fs.writeFileSync('src/utils/toolSearch.ts', fixed)  
  console.log('fixed')  
} else {  
  console.log('marker not found')  
} 
