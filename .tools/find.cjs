const { spawn } = require('child_process');
const path = require('path');

const rgPath = path.join(__dirname, 'rg.exe');
const args = process.argv.slice(2);

// Convert common find patterns to ripgrep equivalents
const rgArgs = [];
let i = 0;
while (i < args.length) {
  const a = args[i];
  if (a === '-name' && args[i + 1]) {
    let pattern = args[++i];
    pattern = pattern.replace(/[\[\]]/g, '\\$&');
    rgArgs.push('--glob', pattern);
  } else if (a === '-type' && args[i + 1]) {
    const t = args[++i];
    if (t === 'f') rgArgs.push('--type', 'f');
    else if (t === 'd') rgArgs.push('--type', 'd');
    else if (t === 'l') rgArgs.push('--type', 'l');
    else rgArgs.push('--type', t);
  } else if (a === '-not' || a === '!') {
    i++;
  } else if (a === '-maxdepth' && args[i + 1]) {
    rgArgs.push('--max-depth', args[++i]);
  } else if (a.startsWith('-')) {
    rgArgs.push(a);
    if (args[i + 1] && !args[i + 1].startsWith('-')) {
      rgArgs.push(args[++i]);
    }
  } else {
    rgArgs.push(a);
  }
  i++;
}

if (!rgArgs.some(a => !a.startsWith('-') && !a.startsWith('--'))) {
  rgArgs.push('.');
}

const child = spawn(rgPath, ['--files', ...rgArgs], {
  stdio: 'inherit',
  windowsHide: true,
});
child.on('exit', (code) => process.exit(code ?? 1));
