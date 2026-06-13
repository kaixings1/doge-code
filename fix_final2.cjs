const fs = require('fs');
let lines = fs.readFileSync('D:/doge-code/src/services/api/claude.ts', 'utf8').split('\n');

// 删除1733-1734行（try外部的变量定义）
lines.splice(1732, 2); // 删除两行

// 现在删除1773-1796行之间的重复注释（保留const apiStorage）
for (let i = 1772; i < lines.length; i++) {
  if (lines[i].includes('const apiStorage = readCustomApiStorage()')) {
    // 删除上面的注释
    while (i > 0 && (lines[i-1].trim().startsWith('//') || lines[i-1].trim() === '')) {
      lines.splice(i-1, 1);
      i--;
    }
    // 删除下面的注释和空代码
    while (i+1 < lines.length && !lines[i+1].includes('if (compatProvider ===')) {
      const nextLine = lines[i+1];
      if (nextLine.trim().startsWith('//') || nextLine.trim() === '' || 
          nextLine.trim().startsWith('/*') || nextLine.includes('process.stderr.write')) {
        lines.splice(i+1, 1);
      } else {
        break;
      }
    }
    break;
  }
}

fs.writeFileSync('D:/doge-code/src/services/api/claude.ts', lines.join('\n'), 'utf8');
console.log('最终行数:', lines.length);

// 验证语法
const syntaxCheck = lines.slice(1725, 1780).join('\n');
console.log('检查语法...\n' + syntaxCheck.substring(0, 500));
