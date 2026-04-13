import { readFileSync, readdirSync } from 'fs';
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
    } else if (/\.(tsx)$/.test(entry.name)) {
      try {
        const content = readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Match "external" that's NOT part of a comparison (=== or !==)
          // and NOT in a comment
          if (/"external"/.test(line) && !/===\s*'/.test(line) && !/!==\s*'/.test(line) && !/['"]external['"]\s*===/.test(line) && !/\s*===\s*['"]external['"]/.test(line)) {
            results.push({
              file: fullPath.replace(srcDir + '\\', ''),
              line: i + 1,
              content: line.trim().substring(0, 120)
            });
          }
        }
      } catch {}
    }
  }
}

scanDir(srcDir);
console.log(`Found ${results.length} suspicious "external" usages:\n`);
for (const r of results.slice(0, 30)) {
  console.log(`${r.file}:${r.line}`);
  console.log(`  ${r.content}`);
  console.log();
}
