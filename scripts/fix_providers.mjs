import fs from 'fs';
let c = fs.readFileSync('D:/doge-code/provider-configs/PROVIDER_INDEX.md', 'utf-8');
// 修复空环境变量显示
c = c.split('- 环境变量: /').join('');
fs.writeFileSync('D:/doge-code/provider-configs/PROVIDER_INDEX.md', c, 'utf-8');
console.log('修复完成');
