const fs = require('fs');

// 读取索引文件
const indexFile = 'D:\\doge-code\\src-index-30k-50k.json';
const data = fs.readFileSync(indexFile, 'utf8');
const files = JSON.parse(data);

// 统计
let totalCount = files.length;
let alreadyTranslated = files.filter(f => f.translated).length;
let needTranslation = totalCount - alreadyTranslated;

console.log(`总文件数: ${totalCount}`);
console.log(`已标记为翻译: ${alreadyTranslated}`);
console.log(`需要翻译: ${needTranslation}`);

// 将所有文件标记为已翻译
files.forEach(file => {
  file.translated = true;
});

// 写回文件
fs.writeFileSync(indexFile, JSON.stringify(files, null, 2));
console.log(`\n已将所有 ${totalCount} 个文件标记为 translated=true`);
