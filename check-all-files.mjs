import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';

const srcDir = 'D:\\doge-code\\src';
const badFiles = [];
let checked = 0;

function getAllTsFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
        files.push(...getAllTsFiles(fullPath));
      }
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = getAllTsFiles(srcDir);
console.log(`Checking ${files.length} files...\n`);

// Check files in batches using bun -e import
async function checkFile(file) {
  const relPath = file.replace(srcDir + '\\', '').replace(/\\/g, '/');
  return new Promise((resolve) => {
    const proc = spawn('bun', ['-e', `import('./src/${relPath}').then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); })`], {
      timeout: 10000,
      cwd: 'D:\\doge-code'
    });
    
    let output = '';
    proc.stdout.on('data', d => output += d.toString());
    proc.stderr.on('data', d => output += d.toString());
    
    proc.on('close', code => {
      if (code !== 0) {
        badFiles.push({ file: relPath, error: output.trim().split('\n')[0] });
      }
      checked++;
      if (checked % 100 === 0) console.log(`Checked ${checked}/${files.length}`);
      resolve();
    });
    
    proc.on('error', () => {
      checked++;
      resolve();
    });
  });
}

// Process in parallel, max 20 at a time
async function runBatch(files) {
  for (let i = 0; i < files.length; i += 20) {
    const batch = files.slice(i, i + 20);
    await Promise.all(batch.map(checkFile));
  }
}

await runBatch(files);

console.log(`\nFound ${badFiles.length} files with import errors:\n`);
for (const f of badFiles.slice(0, 100)) {
  console.log(`${f.file}`);
  console.log(`  Error: ${f.error}`);
  console.log();
}
