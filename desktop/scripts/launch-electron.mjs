import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const mainEntry = path.join(distDir, 'main', 'index.js');

// Step 1: Compile TypeScript to dist/
console.log('Compiling TypeScript...');
const { execSync } = await import('child_process');
try {
  execSync('npx tsc', { cwd: projectRoot, stdio: 'inherit' });
} catch {
  // tsc might fail on type checking but still emit
  console.log('tsc had errors, checking if output exists...');
}

if (!fs.existsSync(mainEntry)) {
  console.error('Build failed: main entry not found at', mainEntry);
  process.exit(1);
}

console.log('Build complete. Starting Electron...');

// Step 2: Find electron binary
const electronBinary = path.join(projectRoot, 'node_modules', '.bin', 'electron.exe');
if (!fs.existsSync(electronBinary)) {
  console.error('Electron binary not found at', electronBinary);
  process.exit(1);
}

// Step 3: Launch electron with the compiled main entry
const child = spawn(electronBinary, [mainEntry], {
  stdio: 'inherit',
  env: { ...process.env, DOGE_DESKTOP: '1' },
});

child.on('error', (err) => {
  console.error('Failed to start Electron:', err.message);
  process.exit(1);
});

await new Promise<void>((resolve) => child.on('exit', resolve));
