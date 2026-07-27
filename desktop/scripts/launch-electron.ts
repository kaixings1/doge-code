import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as esbuild from 'esbuild';

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
  console.log('Bundling main process with esbuild...');

  const outFile = path.join(distDir, 'main', 'index.cjs');
  const outDir = path.dirname(outFile);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  await esbuild.build({
    entryPoints: [path.join(projectRoot, 'src', 'main', 'index.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: outFile,
    tsconfig: path.join(projectRoot, 'tsconfig.main.json'),
    external: ['electron', 'electron-store'],
  });
  console.log('Main process bundled OK');
}

async function compileRenderer(): Promise<void> {
  console.log('Compiling renderer/preload (ES modules)...');
  const c = spawn('cmd', ['/c', 'npx', 'tsc', '-p', 'tsconfig.json'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  const code = await withTimeout(
    () => new Promise<number>((resolve) => c.on('close', (c) => resolve(c ?? 1))),
    'tsc 编译'
  );
  if (code !== 0) throw new Error(`Renderer compile failed: ${code}`);
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
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
  }

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

  const mainEntry = path.join(distDir, 'main', 'index.cjs');
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
