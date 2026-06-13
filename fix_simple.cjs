const fs = require('fs');
let lines = fs.readFileSync('D:/doge-code/src/services/api/claude.ts', 'utf8').split('\n');

// 只删除1729-1735行（环境变量写入代码，7行）
// 这些行从 'const latestConfig = readCustomApiStorage();' 开始
// 到 '} (含)' 结束

// 找到起始行
let startIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const latestConfig = readCustomApiStorage()')) {
    startIdx = i;
    break;
  }
}

if (startIdx >= 0) {
  // 删除7行（const latestConfig 到 })
  lines.splice(startIdx, 7);
  fs.writeFileSync('D:/doge-code/src/services/api/claude.ts', lines.join('\n'), 'utf8');
  console.log('删除环境变量写入代码成功，行数:', lines.length);
} else {
  console.log('未找到起始行');
}
