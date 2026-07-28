#!/usr/bin/env node
/**
 * 桌面端构建脚本
 * 用法: node scripts/build.mjs [--platform win|mac|linux]
 *
 * 流程:
 * 1. 清理 dist 目录
 * 2. 编译主进程 (Bun bundle -> ESM)
 * 3. 编译渲染进程 (tsc -> JS)
 * 4. 打包渲染进程 (esbuild -> bundle)
 * 5. 复制静态资源
 */

import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

// 解析参数
const args = process.argv.slice(2);
const platformArg = args.find(arg => arg.startsWith('--platform='))?.split('=')[1] ||
                   args[args.indexOf('--platform') + 1] || null;

const BUILD_TIMEOUT = 120000; // 2 分钟超时

// ─── 工具函数 ───

function withTimeout(fn, label, ms = BUILD_TIMEOUT) {
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 超时 (${ms / 1000}s)`)), ms)
    ),
  ]);
}

function run(cmd, options = {}) {
  return new Promise((resolve, reject) => {
    const { cwd = projectRoot, stdio = 'inherit', shell = true, env } = options;
    const child = spawn(cmd, { cwd, stdio, shell, env: { ...process.env, ...env } });
    child.on('close', code => code === 0 ? resolve(code) : reject(new Error(`命令退出码: ${code}`)));
    child.on('error', reject);
  });
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`已清理: ${dir}`);
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ─── 构建步骤 ───

async function clean() {
  console.log('\n=== 1. 清理构建目录 ===');
  cleanDir(distDir);
  ensureDir(distDir);
}

async function compileMain() {
  console.log('\n=== 2. 编译主进程 ===');
  const mainOutFile = path.join(distDir, 'main', 'index.mjs');
  ensureDir(path.dirname(mainOutFile));

  // 使用 Bun 打包主进程
  await withTimeout(
    () => run(`bun build --outfile "${mainOutFile}" --format esm --target node --external electron --external electron-store --external bun:sqlite --external bun:bundle src/main/index.ts`),
    '主进程编译'
  );

  // 替换 bun: 协议导入
  let code = fs.readFileSync(mainOutFile, 'utf-8');
  code = code.replace(
    /import\s*\{[^}]*\bfeature\b[^}]*\}\s*from\s*['"]bun:bundle['"];?/g,
    "import { feature } from './bun-bundle-polyfill.js';"
  );
  code = code.replace(
    /import\s*\{[^}]*\}\s*from\s*['"]bun:sqlite['"];?/g,
    "// bun:sqlite polyfilled"
  );
  code = code.replace(
    /await\s+import\s*\(\s*['"]bun:sqlite['"]\s*\)/g,
    'await Promise.resolve({})'
  );
  fs.writeFileSync(mainOutFile, code);
  console.log('主进程编译完成');
}

async function compileRenderer() {
  console.log('\n=== 3. 编译渲染进程 ===');
  await withTimeout(
    () => run('npx tsc -p tsconfig.json'),
    '渲染进程编译'
  );
  console.log('渲染进程编译完成');
}

async function bundleRenderer() {
  console.log('\n=== 4. 打包渲染进程 ===');
  const bundleScript = path.join(projectRoot, 'scripts', '_bundle.mjs');
  if (fs.existsSync(bundleScript)) {
    await withTimeout(
      () => run(`node "${bundleScript}"`),
      '渲染进程打包'
    );
  }
  console.log('渲染进程打包完成');
}

async function copyStaticFiles() {
  console.log('\n=== 5. 复制静态资源 ===');

  // 复制 index.html
  const htmlSrc = path.join(projectRoot, 'src', 'renderer', 'index.html');
  const htmlDest = path.join(distDir, 'renderer', 'index.html');
  if (fs.existsSync(htmlSrc)) {
    ensureDir(path.dirname(htmlDest));
    fs.copyFileSync(htmlSrc, htmlDest);
    console.log('已复制 index.html');
  }

  // 复制 bun-bundle-polyfill
  const polyfillSrc = path.join(projectRoot, 'scripts', 'bun-bundle-polyfill.mjs');
  if (fs.existsSync(polyfillSrc)) {
    fs.copyFileSync(polyfillSrc, path.join(distDir, 'main', 'bun-bundle-polyfill.mjs'));
    console.log('已复制 bun-bundle-polyfill.mjs');
  }
}

async function copyResources() {
  console.log('\n=== 6. 复制应用资源 ===');
  const resourcesDir = path.join(projectRoot, '..', 'resources');
  if (fs.existsSync(resourcesDir)) {
    const destDir = path.join(distDir, 'resources');
    ensureDir(destDir);
    for (const file of fs.readdirSync(resourcesDir)) {
      fs.copyFileSync(
        path.join(resourcesDir, file),
        path.join(destDir, file)
      );
    }
    console.log('已复制 resources');
  }
}

// ─── 主流程 ───

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   DogeCode Desktop Build Script      ║');
  console.log('╚══════════════════════════════════════╝');

  if (platformArg) {
    console.log(`目标平台: ${platformArg}`);
  }

  const startTime = Date.now();

  try {
    await clean();
    await compileMain();
    await compileRenderer();
    await bundleRenderer();
    await copyStaticFiles();
    await copyResources();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ 构建完成 (${elapsed}s)`);
    console.log(`输出目录: ${distDir}`);
  } catch (err) {
    console.error(`\n❌ 构建失败: ${err.message}`);
    process.exit(1);
  }
}

main();
