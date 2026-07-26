const { spawn } = require('child_process');
const path = require('path');

const rgPath = path.join(__dirname, 'rg.exe');
const args = process.argv.slice(2);

// Delegate all args directly to ripgrep.
// ripgrep is compatible with grep for the most common flags (-n, -i, -r, -l, -c, -v, -w, -e, -f, -A, -B, -C).
const child = spawn(rgPath, args, {
  stdio: 'inherit',
  windowsHide: true,
});

child.on('exit', (code) => process.exit(code ?? 1));
