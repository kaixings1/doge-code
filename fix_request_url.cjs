const fs = require('fs');
let lines = fs.readFileSync('D:/doge-code/src/services/api/claude.ts', 'utf8').split('\n');

// 删除1733-1745行左右的 requestUrl构建（查找和删除）
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('// 构建请求地址')) {
    // 删除从这里开始，直到遇到'// 防止在无端点配置时发出真实请求'或'const generator = withRetry'
    let endDel = i;
    while (endDel < lines.length && !lines[endDel].includes('// 防止在无端点配置时发出真实请求') && !lines[endDel].includes('const generator = withRetry')) {
      endDel++;
    }
    // 保留空行结构，删除requestUrl相关代码
    const toDeleteCount = endDel - i;
    lines.splice(i, toDeleteCount);
    break;
  }
}

// 删除'// 防止在无端点配置时发出真实请求'之后的检查代码，直到遇到'const generator = withRetry'
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("// 防止在无端点配置时发出真实请求")) {
    // 删除从这里开始，直到遇到'const generator = withRetry'
    let endDel = i;
    while (endDel < lines.length && !lines[endDel].includes('const generator = withRetry')) {
      endDel++;
    }
    // 包括'const generator = withRetry'前的空行
    const toDeleteCount = endDel - i;
    lines.splice(i, toDeleteCount);
    break;
  }
}

fs.writeFileSync('D:/doge-code/src/services/api/claude.ts', lines.join('\n'), 'utf8');
console.log('处理后行数:', lines.length);
