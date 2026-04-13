import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const srcDir = 'D:\\doge-code\\src';
const results = [];

function getAllTsFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        files.push(...getAllTsFiles(fullPath));
      }
    } else if (entry.name.endsWith('.ts')) {
      const stat = statSync(fullPath);
      if (stat.size > 4096) {
        files.push({ path: fullPath, size: stat.size });
      }
    }
  }
  return files;
}

const tsFiles = getAllTsFiles(srcDir);
console.log(`Found ${tsFiles.length} .ts files > 4KB\n`);

// Sort by size
tsFiles.sort((a, b) => b.size - a.size);

// Print top 30 largest files
console.log('Top 30 largest .ts files:');
for (const f of tsFiles.slice(0, 30)) {
  const relPath = f.path.replace(srcDir + '\\', '');
  console.log(`  ${Math.round(f.size / 1024 * 10) / 10}KB - ${relPath}`);
}
