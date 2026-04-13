import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const srcDir = 'D:\\doge-code\\src';
const results = [];

function getAllFiles(dir, exts) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        files.push(...getAllFiles(fullPath, exts));
      }
    } else if (exts.some(ext => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

const allFiles = getAllFiles(srcDir, ['.ts', '.tsx']);
console.log(`Scanning ${allFiles.length} files for context/usage/stats strings...\n`);

const patterns = [
  /['"]context used['"]/gi,
  /['"]context remaining['"]/gi,
  /['"]tokens used['"]/gi,
  /['"]tokens remaining['"]/gi,
  /['"]context window['"]/gi,
  /['"]out of context['"]/gi,
  /['"]context limit['"]/gi,
  /['"]model usage['"]/gi,
  /['"]API usage['"]/gi,
  /['"]cache (hit|miss|read)['"]/gi,
];

let checked = 0;
for (const file of allFiles) {
  try {
    const content = readFileSync(file, 'utf8');
    const relPath = file.replace(srcDir + '\\', '');
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        results.push({ file: relPath, text: match[0] });
      }
      pattern.lastIndex = 0;
    }
    
    checked++;
    if (checked % 200 === 0) console.log(`Checked ${checked}/${allFiles.length}`);
  } catch {}
}

console.log(`\n\nFound ${results.length} context/usage strings:\n`);
const uniqueStrings = [...new Set(results.map(r => r.text))];
for (const t of uniqueStrings.slice(0, 50)) {
  console.log(t);
}
