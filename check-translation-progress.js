// 翻译进度报告脚本
const fs = require('fs');

const indexFile = 'D:\\doge-code\\src-index-30k-50k.json';
const files = JSON.parse(fs.readFileSync(indexFile, 'utf8'));

const translated = files.filter(f => f.translated).length;
const total = files.length;

console.log(`翻译进度: ${translated}/${total} 文件已标记为 translated`);
console.log(`进度百分比: ${((translated/total)*100).toFixed(1)}%`);
