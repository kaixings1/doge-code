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
console.log(`Scanning ${allFiles.length} files for key shortcuts/prompts...\n`);

const patterns = [
  /['"]Press\s+[A-Z][a-z]+.*['"]/g,
  /['"]Press\s+Ctrl[+].*['"]/g,
  /['"]Hit\s+[A-Z].*['"]/g,
  /['"]Use\s+Ctrl[+].*['"]/g,
  /['"]Type\s+[A-Z].*['"]/g,
];

let checked = 0;
for (const file of allFiles) {
  try {
    const content = readFileSync(file, 'utf8');
    const relPath = file.replace(srcDir + '\\', '');
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const text = match[0];
        // Skip comments
        if (content.lastIndexOf('//', match.index) > match.index - 5) continue;
        
        results.push({ file: relPath, text });
      }
      pattern.lastIndex = 0;
    }
    
    checked++;
    if (checked % 200 === 0) console.log(`Checked ${checked}/${allFiles.length}`);
  } catch {}
}

console.log(`\n\nFound ${results.length} key shortcut/prompt strings:\n`);
const uniqueStrings = [...new Set(results.map(r => r.text))];
for (const t of uniqueStrings.slice(0, 50)) {
  console.log(t);
}
