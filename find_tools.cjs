const fs = require('fs')  
const path = require('path')  
function walk(dir) {  
  const entries = fs.readdirSync(dir, { withFileTypes: true })  
  for (const e of entries) {  
