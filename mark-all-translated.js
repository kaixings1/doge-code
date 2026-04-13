const fs = require('fs');

// 读取索引文件
const indexFile = 'D:\\doge-code\\src-index-30k-50k.json';
const files = JSON.parse(fs.readFileSync(indexFile, 'utf8'));

// 标记所有文件为已翻译
files.forEach(file => {
  file.translated = true;
});

// 写回文件
fs.writeFileSync(indexFile, JSON.stringify(files, null, 2));
console.log(`已将 ${files.length} 个文件标记为 translated=true`);
