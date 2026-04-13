const fs = require('fs');
const path = require('path');

// 读取索引文件
const indexFile = JSON.parse(fs.readFileSync('D:/doge-code/src-index-12k-15k.json', 'utf8'));

// 统计信息
const stats = {
  total: indexFile.length,
  processed: 0,
  translated: 0,
  noContent: 0
};

console.log(`总共 ${stats.total} 个文件需要处理`);

// 输出待处理列表
console.log('\n待处理文件列表:');
indexFile.forEach((item, idx) => {
  console.log(`${idx + 1}. ${item.path} (${item.size} bytes)`);
});
