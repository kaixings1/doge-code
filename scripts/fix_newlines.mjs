import fs from 'fs';
let c = fs.readFileSync('D:/doge-code/provider-configs/PROVIDER_INDEX.md', 'utf-8');
c = c.split('/n').join(String.fromCharCode(10));
fs.writeFileSync('D:/doge-code/provider-configs/PROVIDER_INDEX.md', c, 'utf-8');
console.log('修复完成');
