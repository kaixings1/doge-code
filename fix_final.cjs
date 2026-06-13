const fs = require('fs');
let content = fs.readFileSync('D:/doge-code/src/services/api/claude.ts', 'utf8');
const lines = content.split('\n');

// 删除1729-1768行（环境变量写入和检查）
// 索引1728-1767
console.log('删除前行数:', lines.length);

// 首先删除环境变量写入（1729-1735行）
for (let i = 1728; i <= 1734; i++) {
  if (lines[i].includes('const latestConfig') || 
      lines[i].includes('if (latestConfig.baseURL)') ||
      lines[i].includes('process.env.ANTHROPIC_BASE_URL = latestConfig') ||
      lines[i].includes('process.env.DOGE_API_KEY = latestConfig') ||
      lines[i].includes('process.env.ANTHROPIC_MODEL') ||
      lines[i].includes('process.env.CLAUDE_CODE_COMPATIBLE_API_PROVIDER') ||
      lines[i].trim() === '}') {
    lines.splice(i, 1);
    i--; // 调整索引
  }
}

console.log('删除环境变量写入后行数:', lines.length);

// 删除请求URL构建和调试日志（约1740-1752行）
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('// 构建请求地址') || 
      lines[i].includes('const requestUrl = new URL') ||
      (lines[i].includes('logForDebugging') && lines[i].includes('[request]')) ||
      lines[i].includes('// 原有的调试输出')) {
    lines.splice(i, 1);
    i--;
  }
}

// 删除检查"http://0.0.0.0:1"的检测代码（查找并删除）
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("process.env.ANTHROPIC_BASE_URL === 'http://0.0.0.0:1'") ||
      lines[i].includes('请先使用 /login 配置 API 端点') ||
      (lines[i].includes('return (async function* ()') && lines[i-1]?.includes('// 防止在无端点配置时发出真实请求'))) {
    // 向前查找要删除的开始位置
    let startDel = i;
    while (startDel > 0 && !lines[startDel].includes('// 防止在无端点配置时发出真实请求')) {
      startDel--;
    }
    // 向后查找要删除的结束位置
    let endDel = i;
    while (endDel < lines.length && !lines[endDel].includes('})() as any')) {
      endDel++;
    }
    endDel++; // 包括 })() as any
    lines.splice(startDel, endDel - startDel);
    break;
  }
}

console.log('删除检查代码后行数:', lines.length);

fs.writeFileSync('D:/doge-code/src/services/api/claude.ts', lines.join('\n'), 'utf8');
console.log('保存完成');
