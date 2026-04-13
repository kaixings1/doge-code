const fs = require('fs');
const path = require('path');

// 递归获取所有 .ts/.tsx 文件
function getAllFiles(dir, exts = ['.ts', '.tsx']) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const item of list) {
    if (item === 'node_modules' || item === '.git' || item === 'dist' || item === 'build') continue;
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, exts));
    } else if (exts.includes(path.extname(item))) {
      results.push(fullPath);
    }
  }
  return results;
}

// 检测一行是否包含用户可见的英文字符串
function extractLocalizableStrings(filePath, lines) {
  const results = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // 简单模式:匹配包含英文字母的字符串字面量
  // 排除: 纯代码标识符、已汉化文本、技术常量
  const patterns = [
    // JSX 文本 (在标签之间的英文)
    { regex: />([A-Z][a-z]+[^<]{3,})</g, desc: 'JSX text' },
    // 字符串属性值
    { regex: /(?:title|label|placeholder|description|message|name|hint|error|warning)\s*[=:]\s*["']([^"']{10,})["']/gi, desc: 'String prop' },
    // 模板字符串中的英文消息
    { regex: /`[^`]*(?:Error|Failed|Cannot|Unable|No\s+\w+|Successfully|done|found|not found)[^`]*`/g, desc: 'Template message' },
    // 对象属性中的英文描述
    { regex: /(?:description|prompt|hint|label|title|message)\s*[:=]\s*["']([^"']{15,})["']/gi, desc: 'Description field' },
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // 跳过: 注释、import、纯代码行、已汉化文本
    if (line.trim().startsWith('//') || line.trim().startsWith('*') || 
        line.trim().startsWith('import ') || line.trim().startsWith('export ') ||
        line.trim().startsWith('const ') || line.trim().startsWith('let ') ||
        line.trim().startsWith('return ') && !line.includes("'") && !line.includes('"')) {
      continue;
    }
    
    // 检查是否包含中文字符 - 如果已汉化则跳过
    if (/[\u4e00-\u9fa5]/.test(line)) {
      continue;
    }
    
    // 检查是否包含用户可见英文
    const userFacingPatterns = [
      /["'](Error|Failed|Cannot|Unable|No\s+\w+|Successfully|Please|Could not|denied|requested|not found|Unknown|Missing)[^"']*["']/i,
      /["']([A-Z][a-z]+\s+(?:to|for|the|a|an|is|are|was|were|been))[^"']*["']/i,
      /["']([A-Z][a-z]+.*?(?:found|created|updated|deleted|read|written|searched|running|waiting))["']/i,
    ];
    
    for (const pattern of userFacingPatterns) {
      const match = line.match(pattern);
      if (match) {
        results.push({
          lineNum,
          original: line.trim(),
          match: match[0]
        });
        break;
      }
    }
  }
  
  return results;
}

// 主扫描逻辑
const srcDir = path.join(__dirname, 'src2');
console.log('扫描目录:', srcDir);

const allFiles = getAllFiles(srcDir);
console.log(`找到 ${allFiles.length} 个 TypeScript 文件`);

const report = [];
let processedCount = 0;

for (const file of allFiles) {
  try {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    const strings = extractLocalizableStrings(file, lines);
    
    if (strings.length > 0) {
      report.push({
        file: path.relative(__dirname, file),
        size: fs.statSync(file).size,
        lines: strings.length,
        details: strings
      });
    }
    
    processedCount++;
    if (processedCount % 100 === 0) {
      console.log(`已处理 ${processedCount}/${allFiles.length} 文件`);
    }
  } catch (e) {
    console.error('处理失败:', file, e.message);
  }
}

// 按文件大小排序
report.sort((a, b) => b.size - a.size);

console.log(`\n找到 ${report.length} 个包含可汉化文本的文件`);
console.log('生成报告中...');

// 生成报告
let output = '';
for (const item of report) {
  output += `${item.file}\n`;
  
  for (const detail of item.details.slice(0, 20)) { // 每个文件最多20条
    output += `行号 ${detail.lineNum}: ${detail.original}\n`;
  }
  
  if (item.details.length > 20) {
    output += `... 还有 ${item.details.length - 20} 处\n`;
  }
  
  output += `是否需要执行汉化=   \n\n`;
}

fs.writeFileSync(path.join(__dirname, 'result.txt'), output, 'utf-8');
console.log('报告已写入 result.txt');
