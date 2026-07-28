#!/usr/bin/env node
/**
 * 桌面端开发脚本 — 使用 electron-vite 实现 HMR 热重载
 *
 * 功能：
 * - 主进程 HMR：修改主进程代码后自动重启 Electron
 * - 渲染进程 HMR：修改 React 组件后热更新（不刷新页面）
 * - Preload HMR：修改 preload 脚本后自动重载
 *
 * 用法：node scripts/dev.mjs
 */

import { spawn } from 'node:child_process'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

console.log('╔══════════════════════════════════════╗')
console.log('║   DogeCode Desktop Dev (HMR)         ║')
console.log('╚══════════════════════════════════════╝')
console.log('')
console.log('启动 electron-vite 开发服务器...')
console.log('- 主进程: HMR (自动重启)')
console.log('- 渲染进程: HMR (热更新)')
console.log('- Preload: HMR (自动重载)')
console.log('')

const child = spawn('npx', ['electron-vite', 'dev'], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    DOGE_DESKTOP: '1',
    NODE_TLS_REJECT_UNAUTHORIZED: '0',
  },
})

child.on('error', (err) => {
  console.error('启动失败:', err.message)
  process.exit(1)
})

child.on('exit', (exitCode) => {
  process.exit(exitCode ?? 0)
})

process.on('SIGINT', () => child.kill('SIGTERM'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
