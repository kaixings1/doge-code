#!/usr/bin/env node
/**
 * 桌面端构建脚本 (electron-vite)
 * 用法: node src/desktop-electron/build.mjs
 *
 * 流程:
 * 1. 清理构建目录
 * 2. 使用 electron-vite 编译主进程/渲染进程/preload
 */

import { spawn } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')
const desktopDir = path.resolve(projectRoot, 'desktop-electron')
const distDir = path.join(desktopDir, 'dist')

const BUILD_TIMEOUT = 120000 // 2 分钟超时

function withTimeout(fn, label, ms = BUILD_TIMEOUT) {
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} 超时 (${ms / 1000}s)`)), ms)
    ),
  ])
}

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: true,
      ...options,
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`命令退出码: ${code}`))
    })
    child.on('error', reject)
  })
}

async function clean() {
  console.log('\n=== 1. 清理构建目录 ===')
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true })
    console.log(`已清理: ${distDir}`)
  }
}

async function compile() {
  console.log('\n=== 2. 使用 electron-vite 编译 ===')

  const startTime = Date.now()
  await withTimeout(
    () => run('npx', ['electron-vite', 'build']),
    'electron-vite 编译'
  )
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`编译完成 (${elapsed}s)`)
}

async function main() {
  console.log('╔══════════════════════════════════════╗')
  console.log('║   DogeCode Desktop Build (Vite)      ║')
  console.log('╚══════════════════════════════════════╝')

  try {
    await clean()
    await compile()

    console.log(`\n✅ 构建完成`)
    console.log(`输出目录: ${distDir}`)
  } catch (err) {
    console.error(`\n❌ 构建失败: ${err.message}`)
    process.exit(1)
  }
}

main()
