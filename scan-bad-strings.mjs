import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname } from 'path';

const srcDir = 'D:\\doge-code\\src';
const badFiles = [];

function scanDir(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        scanDir(fullPath);
      }
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      try {
        const content = readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        
        // Check for unterminated strings with Chinese characters
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineNum = i + 1;
          
          // Pattern: string starting with ' but ending with Chinese char and no closing '
          if (/'[^']*[\u4e00-\u9fff][^']*$/.test(line) && !/'[^']*[\u4e00-\u9fff][^']*'$/.test(line)) {
            // Check if next line continues the string
            const nextLine = lines[i + 1] || '';
            if (!nextLine.trim().startsWith("'") && !nextLine.includes("'")) {
              badFiles.push({
                file: fullPath.replace(srcDir + '\\', ''),
                line: lineNum,
                content: line.trim().substring(0, 100)
              });
              break; // Only report first issue per file
            }
          }
        }
      } catch (e) {
        // Skip files we can't read
      }
    }
  }
}

scanDir(srcDir);

console.log(`Found ${badFiles.length} files with potential issues:\n`);
for (const f of badFiles.slice(0, 50)) {
  console.log(`${f.file}:${f.line}`);
  console.log(`  ${f.content}`);
  console.log();
}
