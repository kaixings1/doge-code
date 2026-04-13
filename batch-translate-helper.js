const fs = require('fs');
const path = require('path');

// 读取索引文件
const indexFile = 'D:\\doge-code\\src-index-30k-50k.json';
const files = JSON.parse(fs.readFileSync(indexFile, 'utf8'));

// 找到未翻译的文件
const untranslated = files.filter(f => !f.translated);
console.log(`未翻译的文件数量: ${untranslated.length}`);
console.log('前10个文件:');
untranslated.slice(0, 10).forEach((f, i) => {
  console.log(`${i+1}. ${f.path} (${f.size} bytes)`);
});
