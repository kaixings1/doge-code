const fs = require('fs');
let lines = fs.readFileSync('D:/doge-code/src/services/api/claude.ts', 'utf8').split('\n');

// 删除1774-1782之间的重复注释（保留1776的 const apiStorage）
// 找到 const apiStorage 这一行，删除其上的注释
const apiStorageLine = lines.findIndex(l => l.trim().includes('const apiStorage = readCustomApiStorage()'));
console.log('apiStorage行号:', apiStorageLine + 1);

// 删除上面4行的注释
if (apiStorageLine >= 4) {
  // 删除从 biome-ignore开始的注释直到 const apiStorage
  for (let i = apiStorageLine - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.trim().startsWith('//') || line.trim() === '') {
      lines.splice(i, 1);
    } else {
      break;
    }
  }
}

// 现在删除const apiStorage下面的注释直到if (compatProvider)
const newApiStorageLine = lines.findIndex(l => l.trim().includes('const apiStorage = readCustomApiStorage()'));
console.log('新的apiStorage行号:', newApiStorageLine + 1);

if (newApiStorageLine >= 0) {
  let endCommentLine = newApiStorageLine + 1;
  while (endCommentLine < lines.length && !lines[endCommentLine].includes('if (compatProvider ===')) {
    lines.splice(endCommentLine, 1);
  }
}

// 删除多余的空行
let j = 0;
while (j < lines.length - 1) {
  if (lines[j].trim() === '' && lines[j+1].trim() === '') {
    lines.splice(j, 1);
  } else {
    j++;
  }
}

fs.writeFileSync('D:/doge-code/src/services/api/claude.ts', lines.join('\n'), 'utf8');
console.log('处理后行数:', lines.length);
