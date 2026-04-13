import { readFileSync, readdirSync } from 'fs';
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
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

const allFiles = getAllTsFiles(srcDir);
console.log(`Scanning ${allFiles.length} files for 'error', 'warning', 'info' in strings...\n`);

// Patterns that might need translation (UI-facing text only, not code identifiers)
const patterns = [
  /['"]error['"]/g,
  /['"]warning['"]/g,
  /['"]info['"]/g,
  /['"]success['"]/g,
];

let checked = 0;
for (const file of allFiles) {
  try {
    const content = readFileSync(file, 'utf8');
    const relPath = file.replace(srcDir + '\\', '');
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const line = content.substring(Math.max(0, content.lastIndexOf('\n', match.index - 1)), content.indexOf('\n', match.index)).trim();
        // Skip comments and imports
        if (line.startsWith('//') || line.startsWith('*') || line.startsWith('import ') || line.startsWith('export ')) continue;
        
        results.push({ 
          file: relPath, 
          line: line.substring(0, 120)
        });
      }
      pattern.lastIndex = 0;
    }
    
    checked++;
    if (checked % 500 === 0) console.log(`Checked ${checked}/${allFiles.length}`);
  } catch {}
}

console.log(`\n\nFound ${results.length} instances:\n`);
const fileCounts = {};
for (const r of results) {
  fileCounts[r.file] = (fileCounts[r.file] || 0) + 1;
}

// Show top 20 files
const sorted = Object.entries(fileCounts).sort((a, b) => b[1] - a[1]);
for (const [file, count] of sorted.slice(0, 30)) {
  console.log(`${file}: ${count} occurrences`);
}
