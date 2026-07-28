#!/usr/bin/env node
/**
 * 桌面端生产构建脚本 — 使用 electron-vite
 *
 * 功能：
 * - 编译主进程 (Vite → ESM)
 * - 编译渲染进程 (Vite + React → bundle)
 * - 编译 preload (Vite → CJS)
 *
 * 用法：node scripts/build-vite.mjs
 */

import { spawn } from 'node:child_process'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

console.log('╔══════════════════════════════════════╗')
console.log('║   DogeCode Desktop Build (Vite)      ║')
console.log('╚══════════════════════════════════════╝')

const startTime = Date.now()

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

async function main() {
  try {
    console.log('\n=== 1. 清理构建目录 ===')
    const distDir = path.join(projectRoot, 'dist')
    const fs = await import('node:fs')
    if (fs.existsSync(distDir)) {
      fs.rmSync(distDir, { recursive: true, force: true })
      console.log('已清理 dist/')
    }

    console.log('\n=== 2. 使用 electron-vite 编译 ===')
    await run('npx', ['electron-vite', 'build'])

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`\n✅ 构建完成 (${elapsed}s)`)
    console.log(`输出目录: dist/`)
  } catch (err) {
    console.error(`\n❌ 构建失败: ${err.message}`)
    process.exit(1)
  }
}

main()
