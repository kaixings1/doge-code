const { spawn } = require('child_process');
const path = require('path');

const rgPath = 'rg';
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
    // rg 不支持裸的 --type f/d/l，直接跳过（rg --files 已只返回文件）
    if (t !== 'f' && t !== 'd' && t !== 'l') rgArgs.push('--type', t);
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

// stdin 必须为 'ignore'：上游以 stdio:['pipe', ...] 启动 shell 且从不写、从不关闭 stdin，
// 若 rg 继承之会阻塞等待 stdin 而永不退出，导致整链死锁（CPU 恒为 0）。rg --files 不读 stdin。
const child = spawn(rgPath, ['--files', ...rgArgs], {
  stdio: ['ignore', 'inherit', 'inherit'],
  windowsHide: true,
});
// 必须监听 'error'：spawn 失败（ENOENT 等）时只挂 'exit' 会永不触发，进程悬挂。
child.on('error', (err) => {
  console.error(`find.cjs: failed to spawn ripgrep: ${err.message}`);
  process.exit(127);
});
child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`find.cjs: ripgrep killed by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
