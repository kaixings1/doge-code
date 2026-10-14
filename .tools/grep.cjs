const { spawn } = require('child_process');
const path = require('path');

const rgPath = 'rg';
const args = process.argv.slice(2);

// Delegate all args directly to ripgrep.
// ripgrep is compatible with grep for the most common flags (-n, -i, -r, -l, -c, -v, -w, -e, -f, -A, -B, -C).
//
// stdin 处理（修复"管道内容被吞"）：必须用 'pipe' 并把本进程 stdin 转发给 rg，
// 而不是 'ignore'。
//
// 历史教训一（管道被吞）：曾用 stdio[0]='ignore'（把 fd0 接到 NUL）以避免死锁，
//   但这同时切断了管道输入 —— `... | rg pattern` 时 rg 读到 EOF、返回 1，静默无输出，
//   还会把 pattern 当成路径去递归搜索当前目录（实测扫出 781KB 文件列表）。
//
// 历史教训二（inherit 会死锁）：也不能用 'inherit'。上游（Claude Code 的 Shell.ts）
//   以 stdio:['pipe', ...] 启动 shell 且从不写、从不关闭该 stdin；当 rg 没有路径参数
//   时它会尝试读 stdin，继承到一个永不结束的管道 → 永久阻塞（实测 `(sleep 60) | node` 复现）。
//
// 正确做法：'pipe' + 「有界」转发。
// 关键难点：无法用参数猜「该不该读 stdin」——真正管道场景（`... | rg pat`）需要转发，
// 而上游 shell 给的是一个「永不结束、也从不写入」的空管道（继承它会永久阻塞）。
// 区分二者的判据：真正的管道要么数据立即可读，要么写端已关闭（EOF 立刻到）；
// 空管道在若干毫秒内既无 readable 也无 end。
// 因此：转发 stdin，但若在宽限期内既无数据也未结束，就主动 end() → rg 立即 EOF 退出。
const GRACE_MS = 250;
const child = spawn(rgPath, args, {
  stdio: ['pipe', 'inherit', 'inherit'],
  windowsHide: true,
});

if (child.stdin) {
  child.stdin.on('error', () => { /* 子进程可能先退出，忽略 EPIPE */ });
  const childIn = child.stdin;
  let forwarded = false;
  let settled = false;

  // 兜底：宽限期内没等到任何 stdin 活动，就当作「无输入」，让 rg 立即退出。
  const grace = setTimeout(() => {
    if (!forwarded && !settled && !process.stdin.readableEnded) {
      settled = true;
      process.stdin.pause();
      try { childIn.end(); } catch { /* noop */ }
    }
  }, GRACE_MS);
  grace.unref();

  process.stdin.once('readable', () => {
    forwarded = true;
    clearTimeout(grace);
    process.stdin.pipe(childIn);
  });
  process.stdin.once('end', () => {
    forwarded = true;
    settled = true;
    clearTimeout(grace);
    try { childIn.end(); } catch { /* noop */ }
  });
  process.stdin.once('error', () => {
    settled = true;
    clearTimeout(grace);
    try { childIn.end(); } catch { /* noop */ }
  });
}

// 整体超时兜底：rg 在极端情况下会挂起（网络盘 / 超大目录 / 损坏挂载点），
// 此时 child 的 'exit' 永不触发 → 整链悬挂（与旧的 stdin 死锁同症状）。
// 默认 30s；设 DOGE_TOOLS_TIMEOUT_MS=0 可关闭；负数视为无效、回退默认。
const RAW_TIMEOUT = Number(process.env.DOGE_TOOLS_TIMEOUT_MS);
const TIMEOUT_MS = Number.isFinite(RAW_TIMEOUT) && RAW_TIMEOUT > 0 ? RAW_TIMEOUT : 30000;
const killer = TIMEOUT_MS > 0
  ? setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* noop */ }
      console.error(`grep.cjs: ripgrep timed out after ${TIMEOUT_MS}ms`);
      process.exit(124); // 与 GNU timeout 约定一致
    }, TIMEOUT_MS)
  : null;
if (killer) killer.unref();

// 必须监听 'error'：spawn 失败（如 ENOENT）时只挂 'exit' 会永不触发，进程悬挂。
child.on('error', (err) => {
  if (killer) clearTimeout(killer);
  console.error(`grep.cjs: failed to spawn ripgrep: ${err.message}`);
  process.exit(127);
});
child.on('exit', (code, signal) => {
  if (killer) clearTimeout(killer);
  if (signal) {
    console.error(`grep.cjs: ripgrep killed by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
