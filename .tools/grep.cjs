const { spawn } = require('child_process');
const path = require('path');

const rgPath = 'rg';
const args = process.argv.slice(2);

// Delegate all args directly to ripgrep.
// ripgrep is compatible with grep for the most common flags (-n, -i, -r, -l, -c, -v, -w, -e, -f, -A, -B, -C).
//
// stdin 必须为 'ignore'，不能用 'inherit'：
// 上游（Claude Code 的 Shell.ts）以 stdio:['pipe', ...] 启动 shell，且从不写、从不关闭该 stdin。
// 若 rg 继承这个永不结束的 stdin，会阻塞等待 stdin 而永不退出，
// 导致 node/bash/工具整链死锁（CPU 恒为 0），直到超时被强杀。rg 搜索本就不读 stdin。
const child = spawn(rgPath, args, {
  stdio: ['ignore', 'inherit', 'inherit'],
  windowsHide: true,
});

// 必须监听 'error'：spawn 失败（如 ENOENT）时只挂 'exit' 会永不触发，进程悬挂。
child.on('error', (err) => {
  console.error(`grep.cjs: failed to spawn ripgrep: ${err.message}`);
  process.exit(127);
});
child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`grep.cjs: ripgrep killed by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
