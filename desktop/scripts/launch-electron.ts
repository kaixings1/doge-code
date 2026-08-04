import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, 'dist');
const BUILD_TIMEOUT = 60000;

async function withTimeout<T>(fn: () => Promise<T>, label: string, ms = BUILD_TIMEOUT): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 超时 (${ms / 1000}s)，请检查构建配置`)), ms)
    ),
  ]);
}

async function compileMain(): Promise<void> {
  // 使用 Bun 原生打包主进程（原生支持 TypeScript 和顶级 await）
  const mainOutFile = path.join(distDir, 'main', 'index.mjs');
  const mainOutDir = path.dirname(mainOutFile);
  if (!fs.existsSync(mainOutDir)) fs.mkdirSync(mainOutDir, { recursive: true });

  console.log('Bundling main process with Bun...');
  // 入口必须是 entrypoint.ts：index.ts 只导出 bootDesktop()，
  // 由 entrypoint.ts 调用 app.whenReady() → bootDesktop() → createWindow()
  const c = spawn('cmd', ['/c', 'bun', 'build', '--no-cache', '--outfile', mainOutFile, '--format', 'esm', '--target', 'node', '--external', 'electron', '--external', 'electron-store', '--external', 'bun:sqlite', '--external', 'bun:bundle', '--external', 'playwright', '--external', 'playwright-core', '--external', 'chromium-bidi', path.join('src', 'main', 'entrypoint.ts')], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  const code = await withTimeout(
    () => new Promise<number>((resolve) => c.on('close', (c) => resolve(c ?? 1))),
    'bun build main process'
  );
  if (code !== 0) throw new Error(`Main process build failed: ${code}`);

  // Post-process: 替换所有 bun: 协议导入为本地 polyfill
  let codeText = fs.readFileSync(mainOutFile, 'utf-8')

  // 替换静态 import { feature } from 'bun:bundle'
  let updated = codeText.replace(
    /import\s*\{[^}]*\bfeature\b[^}]*\}\s*from\s*['"]bun:bundle['"];?/g,
    "import { feature } from './bun-bundle-polyfill.js';"
  )

  // 替换静态 import { ... } from 'bun:sqlite'
  updated = updated.replace(
    /import\s*\{[^}]*\}\s*from\s*['"]bun:sqlite['"];?/g,
    "// bun:sqlite polyfilled"
  )

  // 替换动态 import("bun:sqlite") -> 返回空模块（SQLite 在 Electron 桌面端暂不需要）
  updated = updated.replace(
    /await\s+import\s*\(\s*['"]bun:sqlite['"]\s*\)/g,
    'await Promise.resolve({})'
  )

  if (updated !== codeText) {
    fs.writeFileSync(mainOutFile, updated, 'utf-8')
    console.log('Replaced bun: protocol imports with polyfills')
  }

  console.log('Main process bundled OK');

  // 将 node-pty 复制到 dist/main/，使其 require('node-pty') 能找到原生二进制
  const ptySrc = path.join(projectRoot, 'node_modules', 'node-pty')
  const ptyDst = path.join(distDir, 'main', 'node_modules', 'node-pty')
  if (fs.existsSync(ptySrc)) {
    fs.cpSync(ptySrc, ptyDst, { recursive: true })
    console.log('Copied node-pty to dist/main/node_modules/')
  }
}

async function compileRenderer(): Promise<void> {
  console.log('Compiling renderer/preload (ES modules)...');
  const c = spawn('cmd', ['/c', 'npx', 'tsc', '-p', 'tsconfig.json'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  await withTimeout(
    () => new Promise<number>((resolve) => c.on('close', (c) => resolve(c ?? 1))),
    'tsc 编译'
  );
}

async function bundle(): Promise<void> {
  console.log('Bundling renderer and preload with esbuild...');
  const bundleScript = path.join(projectRoot, 'scripts', '_bundle.mjs');
  const c = spawn(process.execPath, [bundleScript], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  const code = await withTimeout(
    () => new Promise<number>((resolve) => c.on('close', (c) => resolve(c ?? 1))),
    'esbuild bundle'
  );
  if (code !== 0) throw new Error(`Bundle failed: ${code}`);
}

async function main(): Promise<void> {
  // 只清理子目录，保留主进程输出（如果有缓存）
  const mainDir = path.join(distDir, 'main')
  const rendererDir = path.join(distDir, 'renderer')
  if (fs.existsSync(mainDir)) fs.rmSync(mainDir, { recursive: true })
  if (fs.existsSync(rendererDir)) fs.rmSync(rendererDir, { recursive: true })

  await compileMain();
  await compileRenderer();
  await bundle();

  const rendererDist = path.join(distDir, 'renderer');
  if (!fs.existsSync(rendererDist)) fs.mkdirSync(rendererDist, { recursive: true });
  fs.copyFileSync(
    path.join(projectRoot, 'src', 'renderer', 'index.html'),
    path.join(rendererDist, 'index.html')
  );

  console.log('Build complete. Starting Electron...');

  const electronBinary = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
  if (!fs.existsSync(electronBinary)) {
    console.error('Electron binary not found at', electronBinary);
    process.exit(1);
  }

  // Electron 加载打包后的 ESM 主进程入口
  const mainEntry = path.join(distDir, 'main', 'index.mjs');
  const child = spawn(electronBinary, [mainEntry], {
    stdio: 'inherit',
    env: { ...process.env, DOGE_DESKTOP: '1', NODE_TLS_REJECT_UNAUTHORIZED: '0' },
  });

  child.on('error', (err) => {
    console.error('Failed to start Electron:', err.message);
    process.exit(1);
  });

  // 如果 Electron 进程未在合理时间内退出（即应用还在运行），
  // 不主动杀掉它——只在收到 SIGINT/SIGTERM 时让 Electron 自然退出。
  child.on('exit', (exitCode) => {
    process.exit(exitCode ?? 0);
  });

  // 父进程退出时通知 Electron
  process.on('SIGINT', () => child.kill('SIGTERM'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
}

main().catch((err) => {
  console.error('Build error:', err);
  process.exit(1);
});
