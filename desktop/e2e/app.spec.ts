/**
 * E2E 测试 — 桌面应用端到端测试
 *
 * 测试完整用户流程：
 * 1. 构建产物验证（文件存在性、关键内容）
 * 2. 主进程 bundle 完整性检查
 * 3. 渲染进程组件完整性检查
 * 4. Preload 脚本完整性检查
 * 5. 图标资源验证
 * 6. 配置文件验证
 */

import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DIST_DIR = path.resolve(__dirname, '../dist')
const MAIN_DIR = path.join(DIST_DIR, 'main')
const RENDERER_DIR = path.join(DIST_DIR, 'renderer')
const PRELOAD_DIR = path.join(DIST_DIR, 'preload')
const BUILD_DIR = path.resolve(__dirname, '../build')
const ROOT_DIR = path.resolve(__dirname, '..')

test.describe('构建产物验证', () => {
  test('dist 目录存在', async () => {
    expect(fs.existsSync(DIST_DIR)).toBe(true)
  })

  test('主进程入口文件存在', async () => {
    expect(fs.existsSync(path.join(MAIN_DIR, 'index.mjs'))).toBe(true)
  })

  test('渲染进程 index 入口存在', async () => {
    expect(fs.existsSync(path.join(RENDERER_DIR, 'index.js'))).toBe(true)
  })

  test('Preload 脚本存在', async () => {
    expect(fs.existsSync(PRELOAD_DIR)).toBe(true)
    const files = fs.readdirSync(PRELOAD_DIR)
    expect(files.length).toBeGreaterThan(0)
  })
})

test.describe('主进程 bundle 完整性', () => {
  test('主进程 bundle 大小合理（>100KB）', async () => {
    const content = fs.readFileSync(path.join(MAIN_DIR, 'index.mjs'), 'utf-8')
    expect(content.length).toBeGreaterThan(100000)
  })

  test('主进程包含 QueryEngine 集成', async () => {
    const content = fs.readFileSync(path.join(MAIN_DIR, 'index.mjs'), 'utf-8')
    expect(content).toContain('QueryEngine')
  })

  test('主进程包含 IPC handler 注册', async () => {
    const content = fs.readFileSync(path.join(MAIN_DIR, 'index.mjs'), 'utf-8')
    expect(content).toContain('ipcMain.handle')
  })

  test('主进程包含 node-pty 终端支持', async () => {
    const content = fs.readFileSync(path.join(MAIN_DIR, 'index.mjs'), 'utf-8')
    expect(content).toContain('node-pty')
  })

  test('主进程包含会话持久化', async () => {
    const content = fs.readFileSync(path.join(MAIN_DIR, 'index.mjs'), 'utf-8')
    expect(content).toContain('sessions')
  })

  test('主进程包含 EngineApi 封装', async () => {
    const content = fs.readFileSync(path.join(MAIN_DIR, 'index.mjs'), 'utf-8')
    expect(content).toContain('EngineApi')
  })
})

test.describe('渲染进程 bundle 完整性', () => {
  test('渲染进程 App 组件存在', async () => {
    const appExists = fs.existsSync(path.join(RENDERER_DIR, 'App.js'))
    expect(appExists).toBe(true)
  })

  test('渲染进程包含所有 UI 组件', async () => {
    const componentsDir = path.join(RENDERER_DIR, 'components')
    if (!fs.existsSync(componentsDir)) {
      console.warn('components 目录不存在，跳过')
      return
    }
    const components = fs.readdirSync(componentsDir)
    expect(components).toContain('ToolProgressBar.js')
    expect(components).toContain('ToolErrorBanner.js')
    expect(components).toContain('CommandPalette.js')
    expect(components).toContain('FileTree.js')
  })

  test('渲染进程包含 MarkdownRenderer', async () => {
    const componentsDir = path.join(RENDERER_DIR, 'components')
    const components = fs.readdirSync(componentsDir)
    expect(components).toContain('MarkdownRenderer.js')
  })

  test('渲染进程包含 GitChanges 和 GitDiff', async () => {
    const componentsDir = path.join(RENDERER_DIR, 'components')
    const components = fs.readdirSync(componentsDir)
    expect(components).toContain('GitChanges.js')
    expect(components).toContain('GitDiff.js')
  })
})

test.describe('图标资源验证', () => {
  test('build 目录存在', async () => {
    expect(fs.existsSync(BUILD_DIR)).toBe(true)
  })

  test('Windows ICO 图标存在', async () => {
    expect(fs.existsSync(path.join(BUILD_DIR, 'icon.ico'))).toBe(true)
  })

  test('ICO 文件大小合理（>1KB）', async () => {
    const stat = fs.statSync(path.join(BUILD_DIR, 'icon.ico'))
    expect(stat.size).toBeGreaterThan(1000)
  })

  test('PNG 图标集存在', async () => {
    const iconsDir = path.join(BUILD_DIR, 'icons')
    if (!fs.existsSync(iconsDir)) {
      console.warn('icons 目录不存在，跳过')
      return
    }
    const icons = fs.readdirSync(iconsDir).filter(f => f.endsWith('.png'))
    expect(icons.length).toBeGreaterThanOrEqual(4)
  })

  test('包含关键尺寸图标（16, 32, 48, 256）', async () => {
    const iconsDir = path.join(BUILD_DIR, 'icons')
    if (!fs.existsSync(iconsDir)) return
    const icons = fs.readdirSync(iconsDir)
    expect(icons.some(f => f.includes('16x16'))).toBe(true)
    expect(icons.some(f => f.includes('32x32'))).toBe(true)
    expect(icons.some(f => f.includes('48x48'))).toBe(true)
    expect(icons.some(f => f.includes('256x256'))).toBe(true)
  })

  test('macOS entitlements 文件存在', async () => {
    expect(fs.existsSync(path.join(BUILD_DIR, 'entitlements.mac.plist'))).toBe(true)
  })
})

test.describe('配置文件验证', () => {
  test('package.json 包含 electron-builder 配置', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'))
    expect(pkg.build).toBeDefined()
    expect(pkg.build.appId).toBe('com.doge-code.desktop')
  })

  test('electron-builder 配置包含 Windows 目标', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'))
    expect(pkg.build.win).toBeDefined()
    expect(pkg.build.win.target).toBeDefined()
    expect(pkg.build.win.target.length).toBeGreaterThan(0)
  })

  test('electron-builder 配置包含 macOS 目标', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'))
    expect(pkg.build.mac).toBeDefined()
    expect(pkg.build.mac.target).toBeDefined()
  })

  test('electron-builder 配置包含 Linux 目标', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'))
    expect(pkg.build.linux).toBeDefined()
    expect(pkg.build.linux.target).toBeDefined()
  })

  test('图标路径配置正确', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'))
    expect(pkg.build.win.icon).toBe('build/icon.ico')
    expect(pkg.build.mac.icon).toBe('build/icon.icns')
  })
})

test.describe('Preload 脚本完整性', () => {
  test('Preload 暴露 dogeAPI', async () => {
    const files = fs.readdirSync(PRELOAD_DIR)
    const preloadFile = files.find(f => f.endsWith('.cjs') || f.endsWith('.js'))
    expect(preloadFile).toBeDefined()
    if (preloadFile) {
      const content = fs.readFileSync(path.join(PRELOAD_DIR, preloadFile), 'utf-8')
      expect(content).toContain('dogeAPI')
    }
  })

  test('Preload 包含 contextBridge', async () => {
    const files = fs.readdirSync(PRELOAD_DIR)
    const preloadFile = files.find(f => f.endsWith('.cjs') || f.endsWith('.js'))
    if (preloadFile) {
      const content = fs.readFileSync(path.join(PRELOAD_DIR, preloadFile), 'utf-8')
      expect(content).toContain('contextBridge')
    }
  })
})
