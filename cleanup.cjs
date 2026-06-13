const fs = require('fs');
let content = fs.readFileSync('D:/doge-code/src/services/api/claude.ts', 'utf8');
const lines = content.split('\n');

// 删除1733-1734行（try外的baseURL/compatProvider定义）
for (let i = 1732; i <= 1733; i++) {
  if (i < lines.length) lines.splice(i, 1);
}

// 删除1777-1796行（重复的注释和apiStorage调用）
// 保留从"const apiStorage"开始的行，但删除重复的注释
for (let i = 1776; i < lines.length && i <= 1796; i++) {
  const line = lines[i] || '';
  // 保留const apiStorage行，但是需要修改后面的代码
  if (line.trim().startsWith('//') || line.trim() === '' || line.includes('/*if') || line.includes('process.stderr.write')) {
    lines.splice(i, 1);
    i--;
  }
}

// 现在删除1776-1794之间的重复注释（保留const apiStorage）
console.log('行数:', lines.length);
fs.writeFileSync('D:/doge-code/src/services/api/claude.ts', lines.join('\n'), 'utf8');
