const fs = require('fs'); 
const fs = require('fs');  
const f = fs.readFileSync('src/ink/ink.tsx', 'utf8'); 
const patch1 = 'this.currentNode = node;' + String.fromCharCode(10) + '    try { fs.writeFileSync('d:/trace.txt', 'INK_SET_NODE\n', {flag:'a'}); } catch(e) {}'; 
if (f.includes('this.currentNode = node;')) { 
const patch1 = 'this.currentNode = node;' + String.fromCharCode(10) + '    try { fs.writeFileSync('d:/trace.txt', 'INK_SET_NODE\n', {flag:'a'}); } catch(e) {}'; 
