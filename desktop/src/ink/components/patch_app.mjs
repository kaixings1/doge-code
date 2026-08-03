import fs from 'fs'  
const f = 'App.tsx'  
let s = fs.readFileSync(f, 'utf8')  
if (s.includes('processKeysInBatchCallCount')) { console.log('ALREADY_PATCHED'); process.exit(0); }  
const target = 'function processKeysInBatch(app: App, items: ParsedInput[], _unused1: undefined, _unused2: undefined): void {'  
if (!s.includes(target)) { console.log('TARGET_NOT_FOUND'); process.exit(1); }  
const repl = 'let processKeysInBatchCallCount = 0;\nfunction processKeysInBatch(app: App, items: ParsedInput[], _unused1: undefined, _unused2: undefined): void {\n  processKeysInBatchCallCount++;'  
const result = s.replace(target, repl)  
fs.writeFileSync(f, result)  
console.log('PATCHED')  
