import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const srcDir = 'D:\\doge-code\\src';
const results = [];

function scanDir(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        scanDir(fullPath);
      }
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      try {
        const content = readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmed = line.trim();
          
          // 跳过注释行
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
          // 跳过 import/export/require
          if (trimmed.startsWith('import ') || trimmed.startsWith('export ') || trimmed.includes('require(')) continue;
          // 跳过类型定义
          if (trimmed.startsWith('type ') || trimmed.startsWith('interface ') || trimmed.startsWith('enum ') || trimmed.startsWith('declare ')) continue;
          
          // 查找单引号或双引号包裹的英文字符串（至少2个单词）
          const stringPattern = /['"]([A-Z][a-zA-Z]+ [a-zA-Z][a-zA-Z ]*?)['"]/g;
          let match;
          while ((match = stringPattern.exec(line)) !== null) {
            const fullMatch = match[0];
            const text = match[1];
            
            // 过滤条件
            if (text.length < 10 || text.length > 200) continue;
            if (text.includes('\u4e00')) continue;
            if (text.startsWith('http') || text.includes('://')) continue;
            if (/^\d+$/.test(text.replace(/ /g, ''))) continue;
            
            // 排除已知的内部文本模式
            const skipPatterns = [
              /^Error:/, /^Warning:/, /^Info:/, /^Debug:/, /^Trace:/,
              /^Unknown error/, /^No response/, /^Failed to/,
              /^Cannot/, /^Could not/, /^Unable to/,
              /^[a-z]+-[a-z]+$/,
              /^[A-Z_]+$/,
              /^[a-z_]+$/,
              /^@[a-z]/,
              /^\.[a-z]/,
            ];
            if (skipPatterns.some(p => p.test(text))) continue;
            
            // 检查是否在用户界面上下文中
            const isUIText = (
              /<Text[^>]*>/.test(line) ||
              /onDone\s*\(/.test(line) ||
              /setError\s*\(/.test(line) ||
              /message\s*[:=]\s*['"]/.test(line) ||
              /label\s*[:=]\s*['"]/.test(line) ||
              /title\s*[:=]\s*['"]/.test(line) ||
              /subtitle\s*[:=]\s*['"]/.test(line) ||
              /description\s*[:=]\s*['"]/.test(line) ||
              /placeholder\s*[:=]\s*['"]/.test(line) ||
              /action\s*=\s*['"]/.test(line) ||
              /jsx\s*:\s*/.test(line) ||
              /value\s*:\s*['"]/.test(line) ||
              /hint\s*:\s*['"]/.test(line) ||
              /tip\s*:\s*['"]/.test(line) ||
              /help\s*:\s*['"]/.test(line) ||
              /guide\s*:\s*['"]/.test(line) ||
              /usage\s*:\s*['"]/.test(line) ||
              /example\s*:\s*['"]/.test(line)
            );
            
            const isCommandText = (
              /return\s+['"][A-Z]/.test(line) ||
              /return\s+`[A-Z]/.test(line) ||
              /\.write\(['"][A-Z]/.test(line) ||
              /process\.(stdout|stderr)\.write/.test(line) ||
              /console\.(log|warn|error)\(['"][A-Z]/.test(line)
            );
            
            if (isUIText || isCommandText) {
              const relPath = fullPath.replace(srcDir + '/', '').replace(/\\/g, '/');
              results.push({
                file: relPath,
                line: i + 1,
                text: text.substring(0, 150)
              });
            }
          }
        }
      } catch (e) {
        // ignore
      }
    }
  }
}

scanDir(srcDir);

// 去重并按文件分组
const byFile = {};
results.forEach(r => {
  if (!byFile[r.file]) byFile[r.file] = [];
  byFile[r.file].push(r);
});

console.log('===== 发现需要汉化的文件 =====');
console.log('文件数:', Object.keys(byFile).length);
console.log('字符串数:', results.length);
console.log('\n===== 文件列表 =====\n');

Object.keys(byFile).sort().forEach(file => {
  console.log(file);
  byFile[file].forEach(item => {
    console.log('  L' + item.line + ': ' + item.text);
  });
  console.log();
});

// 输出为 JSON 文件供后续处理
writeFileSync('D:\\doge-code\\remaining-english-strings.json', JSON.stringify(byFile, null, 2), 'utf8');
console.log('\n===== 结果已保存到 remaining-english-strings.json =====');
