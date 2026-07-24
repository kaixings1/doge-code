const fs = require('fs');  
const f = 'src/ink/components/App.tsx';  
let s = fs.readFileSync(f, 'utf8');  
  
if (!s.includes('processKeysInBatchCallCount')) {  
  const target = String.raw\`function processKeysInBatch(app: App, items: ParsedInput[], _unused1: undefined, _unused2: undefined): void {\`;  
  const repl = String.raw\`let processKeysInBatchCallCount = 0;\` + String.raw\`\nfunction processKeysInBatch(app: App, items: ParsedInput[], _unused1: undefined, _unused2: undefined): void {\n  processKeysInBatchCallCount++;\`;  
  s = s.replace(target, repl);  
}  
  
const map = new Map();  
map.set(\"writeFileSync('d:/trace.txt', 'BATCH_ITEM kind=' + item.kind + '\\\\n',\", \"writeFileSync('d:/trace.txt', 'BATCH_ITEM kind=' + item.kind + ' [call#'+processKeysInBatchCallCount+']\\\\n',\");  
map.set(\"writeFileSync('d:/trace.txt', 'APP_AFTER_HANDLE_INPUT\\\\n',\", \"writeFileSync('d:/trace.txt', 'APP_AFTER_HANDLE_INPUT [call#'+processKeysInBatchCallCount+']\\\\n',\");  
map.set(\"writeFileSync('d:/trace.txt', 'APP_AFTER_EMIT\\\\n',\", \"writeFileSync('d:/trace.txt', 'APP_AFTER_EMIT [call#'+processKeysInBatchCallCount+']\\\\n',\");  
map.set(\"writeFileSync('d:/trace.txt', 'APP_AFTER_DISPATCH\\\\n',\", \"writeFileSync('d:/trace.txt', 'APP_AFTER_DISPATCH [call#'+processKeysInBatchCallCount+']\\\\n',\");  
map.set(\"writeFileSync('d:/trace.txt', 'BATCH_END\\\\n',\", \"writeFileSync('d:/trace.txt', 'BATCH_END [call#'+processKeysInBatchCallCount+']\\\\n',\");  
for (const [oldStr, newStr] of map) { s = s.split(oldStr).join(newStr); }  
fs.writeFileSync(f, s);  
console.log('DONE');  
 
