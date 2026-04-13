import { readFileSync, readdirSync } from 'fs';
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
      files.push(fullPath);
    }
  }
  return files;
}

const tsxFiles = getAllTsxFiles(srcDir);
console.log(`Scanning ${tsxFiles.length} tsx files...\n`);

// More comprehensive patterns for English UI text
const patterns = [
  /"[A-Z][a-z]+ (?:[a-z]+ ){2,}"/g,  // "Capitalized phrase text"
  /'[A-Z][a-z]+ (?:[a-z]+ ){2,}'/g,   // 'Capitalized phrase text'
  />[A-Z][a-z]+ (?:[a-z]+ ){2,}</g,   // >Capitalized phrase text<
  /label="?[A-Z][a-z]+ (?:[a-z]+ )*/g, // label="Some text
  /placeholder="?[A-Z][a-z]+/g,        // placeholder="Some text
  /title="?[A-Z][a-z]+/g,              // title="Some text
  /subtitle="?[A-Z][a-z]+/g,           // subtitle="Some text
  /description="?[A-Z][a-z]+/g,        // description="Some text
];

let checked = 0;
for (const file of tsxFiles) {
  try {
    const content = readFileSync(file, 'utf8');
    const relPath = file.replace(srcDir + '\\', '');
    
    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        for (const m of matches) {
          // Filter out common code patterns that aren't UI text
          if (m.includes('import ') || m.includes('export ') || m.includes('function ') || 
              m.includes('const ') || m.includes('let ') || m.includes('type ') ||
              m.includes('interface ') || m.includes('enum ') || m.includes('class ')) {
            continue;
          }
          // Filter out known i18n patterns
          if (m.includes('t(') || m.includes('i18n') || m.includes('translation')) {
            continue;
          }
          results.push({ file: relPath, text: m.substring(0, 100) });
        }
      }
    }
    
    checked++;
    if (checked % 100 === 0) console.log(`Checked ${checked}/${tsxFiles.length}`);
  } catch (e) {
    // Skip
  }
}

console.log(`\n\nFound ${results.length} potential English UI strings:\n`);
for (const r of results.slice(0, 100)) {
  console.log(`${r.file}`);
  console.log(`  ${r.text}`);
  console.log();
}

if (results.length === 0) {
  console.log('✅ No English UI strings found - all appears to be translated!');
}
