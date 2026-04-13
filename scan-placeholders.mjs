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
console.log(`Scanning ${tsxFiles.length} tsx files for placeholder/title...\n`);

// Match placeholder='...' or title='...' or placeholder="..." or title="..."
const patterns = [
  /placeholder=['"]([^'"]{5,})['"]/g,
  /title=['"]([^'"]{5,})['"]/g,
  /subtitle=['"]([^'"]{5,})['"]/g,
  /description=['"]([^'"]{5,})['"]/g,
  /label=['"]([^'"]{5,})['"]/g,
];

// Known proper nouns that shouldn't be translated
const skipTerms = ['Chrome', 'PowerShell', 'Sandbox', 'Hook', 'MCP', 'API', 'URL', 'JSON', 'CSV', 'Git', 'GitHub', 'Claude', 'Bash', 'Python', 'Node', 'Linux', 'Windows', 'Mac', 'iOS', 'Android', 'Tmux', 'SSH', 'HTTP', 'HTTPS', 'OAuth', 'JWT', 'CLI'];

let checked = 0;
for (const file of tsxFiles) {
  try {
    const content = readFileSync(file, 'utf8');
    const relPath = file.replace(srcDir + '\\', '');
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const text = match[1];
        // Check if text contains mostly English words
        const englishWords = text.match(/[A-Z][a-z]+/g);
        if (englishWords && englishWords.length >= 1) {
          // Skip if it's just a proper noun
          const isProperNoun = englishWords.every(w => skipTerms.includes(w));
          if (!isProperNoun && text.length > 4) {
            results.push({ 
              file: relPath, 
              attr: match[0].split('=')[0],
              text: text 
            });
          }
        }
      }
      pattern.lastIndex = 0; // Reset for next file
    }
    
    checked++;
    if (checked % 100 === 0) console.log(`Checked ${checked}/${tsxFiles.length}`);
  } catch (e) {
    // Skip
  }
}

console.log(`\n\nFound ${results.length} untransliterated placeholder/title strings:\n`);
for (const r of results.slice(0, 100)) {
  console.log(`${r.file}`);
  console.log(`  ${r.attr}="${r.text}"`);
  console.log();
}
