const fs = require('fs');
let content = fs.readFileSync('D:/doge-code/src/services/api/claude.ts', 'utf8');
const lines = content.split('\n');

// 删除1729-1768行（除去 try 块和 generator 定义）
// 具体要删除的行：
// 1729-1735: 环境变量写入
// 1740-1752: requestUrl构建和调试
// 1755-1768: 检查http://0.0.0.0:1和返回提示

// 先删除1729-1735行（9行）
lines.splice(1728, 7);

// 现在1740变成了1721（因为删除了7行）
// 删除 requestUrl相关代码（查找包含'构建请求地址'的行）
let i = 0;
while (i < lines.length) {
  if (lines[i].includes('// 构建请求地址')) {
    // 删除从这里开始到下一个空行或注释之前的所有内容
    while (i < lines.length && !lines[i].includes('const generator = withRetry')) {
      if (lines[i].includes('// 防止在无端点配置时发出真实请求')) break;
      lines.splice(i, 1);
    }
    break;
  }
  i++;
}

console.log('中间行数:', lines.length);

// 删除'防止在无端点配置时发出真实请求'检查代码
for (let j = 0; j < lines.length; j++) {
  if (lines[j].includes("// 防止在无端点配置时发出真实请求")) {
    // 删除从j开始，直到遇到'const generator = withRetry'之前的所有内容
    while (j < lines.length && !lines[j].includes('const generator = withRetry')) {
      lines.splice(j, 1);
    }
    break;
  }
}

console.log('最终行数:', lines.length);
fs.writeFileSync('D:/doge-code/src/services/api/claude.ts', lines.join('\n'), 'utf8');
console.log('保存完成');
