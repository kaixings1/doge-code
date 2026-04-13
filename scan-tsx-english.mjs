import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const srcDir = 'D:\\doge-code\\src';
const results = [];

function getAllTsxFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        files.push(...getAllTsxFiles(fullPath));
      }
    } else if (entry.name.endsWith('.tsx')) {
      const stat = statSync(fullPath);
      if (stat.size > 2048) {
        files.push({ path: fullPath, size: stat.size });
      }
    }
  }
  return files;
}

const tsxFiles = getAllTsxFiles(srcDir);
console.log(`Found ${tsxFiles.length} tsx files > 2KB\n`);

// Check for English strings in JSX text content
function findEnglishStrings(content, filePath) {
  const issues = [];
  const relPath = filePath.replace(srcDir + '\\', '');
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // Skip comments and imports
    if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('import ') || line.trim().startsWith('export ')) continue;
    
    // Look for English text in JSX: >English Text< or 'English Text'
    // Match strings that are mostly English words
    const matches = line.match(/>[A-Z][a-z]+(?:\s+[a-z]+){2,}</g) || [];
    for (const m of matches) {
      if (m.length > 20) { // Only significant strings
        issues.push({ line: lineNum, text: m.trim().substring(0, 80) });
      }
    }
  }
  
  return issues;
}

let checked = 0;
for (const file of tsxFiles) {
  try {
    const content = readFileSync(file.path, 'utf8');
    const issues = findEnglishStrings(content, file.path);
    if (issues.length > 0) {
      results.push({ 
        file: file.path.replace(srcDir + '\\', ''), 
        sizeKB: Math.round(file.size / 1024 * 10) / 10,
        issues 
      });
    }
    checked++;
    if (checked % 20 === 0) console.log(`Checked ${checked}/${tsxFiles.length}`);
  } catch (e) {
    // Skip files we can't read
  }
}

console.log(`\n\nFound ${results.length} files with potential English strings:\n`);
for (const r of results.slice(0, 50)) {
  console.log(`${r.file} (${r.sizeKB}KB) - ${r.issues.length} issues`);
  for (const issue of r.issues.slice(0, 3)) {
    console.log(`  Line ${issue.line}: ${issue.text}`);
  }
  console.log();
}
