import fs from 'fs';

const indexFile = 'D:\\doge-code\\src-index-30k-50k.json';
const data = fs.readFileSync(indexFile, 'utf8');
const files = JSON.parse(data);

const count = files.length;
files.forEach(f => f.translated = true);

fs.writeFileSync(indexFile, JSON.stringify(files, null, 2));
console.log(`已将 ${count} 个文件标记为 translated=true`);
