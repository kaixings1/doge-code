const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let pattern = '';
let filePath = '';
let countOnly = false;
let caseInsensitive = false;
let contextLines = 0;
let showLineNumbers = true;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-c' || args[i] === '--count') countOnly = true;
  else if (args[i] === '-i' || args[i] === '--ignore-case') caseInsensitive = true;
  else if (args[i] === '-n') showLineNumbers = true;
  else if (args[i] === '-C' || args[i] === '--context') contextLines = parseInt(args[++i]) || 0;
  else if (args[i].startsWith('-')) continue;
  else if (!pattern) pattern = args[i];
  else if (!filePath) filePath = args[i];
}

if (!pattern || !filePath) {
  process.exit(1);
}

try {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const flags = caseInsensitive ? 'gi' : 'g';
  let regex;
  try {
    regex = new RegExp(pattern, flags);
  } catch {
    regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  }

  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      matches.push(i);
    }
  }

  if (countOnly) {
    console.log(matches.length);
    process.exit(0);
  }

  for (const idx of matches) {
    const start = Math.max(0, idx - contextLines);
    const end = Math.min(lines.length - 1, idx + contextLines);
    for (let j = start; j <= end; j++) {
      if (showLineNumbers) {
        console.log(`${j + 1}:${lines[j]}`);
      } else {
        console.log(lines[j]);
      }
    }
  }
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
