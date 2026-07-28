#!/usr/bin/env node
/**
 * 桌面端打包脚本
 * 用法: node scripts/pack.mjs [--platform win|mac|linux]
 *
 * 依赖: electron-builder
 * 输出: release/ 目录
 */

import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// 解析参数
const args = process.argv.slice(2);
const platformArg = args.find(arg => arg.startsWith('--platform='))?.split('=')[1] ||
                   args[args.indexOf('--platform') + 1] || null;

const PACK_TIMEOUT = 600000; // 10 分钟超时

function withTimeout(fn, label, ms = PACK_TIMEOUT) {
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

async function checkBuild() {
  const distDir = path.join(projectRoot, 'dist');
  if (!fs.existsSync(distDir)) {
    throw new Error('dist 目录不存在，请先运行 build');
  }
  const mainEntry = path.join(distDir, 'main', 'index.mjs');
  if (!fs.existsSync(mainEntry)) {
    throw new Error('主进程入口不存在，请先运行 build');
  }
}

async function pack() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   DogeCode Desktop Pack Script       ║');
  console.log('╚══════════════════════════════════════╝');

  if (platformArg) {
    console.log(`目标平台: ${platformArg}`);
  }

  await checkBuild();

  const startTime = Date.now();

  try {
    // 构建 electron-builder 命令
    let cmd = 'npx electron-builder';

    if (platformArg) {
      const platformMap = { win: 'win', mac: 'mac', linux: 'linux' };
      const ebPlatform = platformMap[platformArg];
      if (ebPlatform) {
        cmd += ` --${ebPlatform}`;
      }
    }

    // 如果指定了架构
    const archArg = args.find(arg => arg.startsWith('--arch='))?.split('=')[1] ||
                    args[args.indexOf('--arch') + 1];
    if (archArg) {
      cmd += ` --${archArg}`;
    }

    console.log(`执行: ${cmd}`);

    await withTimeout(
      () => run(cmd),
      '打包'
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ 打包完成 (${elapsed}s)`);
    console.log(`输出目录: ${path.join(projectRoot, 'release')}`);

    // 列出生成的文件
    const releaseDir = path.join(projectRoot, 'release');
    if (fs.existsSync(releaseDir)) {
      console.log('\n生成文件:');
      for (const file of fs.readdirSync(releaseDir)) {
        const filePath = path.join(releaseDir, file);
        const stats = fs.statSync(filePath);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
        console.log(`  ${file} (${sizeMB} MB)`);
      }
    }
  } catch (err) {
    console.error(`\n❌ 打包失败: ${err.message}`);
    process.exit(1);
  }
}

pack();
