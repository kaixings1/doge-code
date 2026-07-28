/**
 * Electron App 启动辅助 - Playwright E2E 测试
 *
 * 启动 Electron 应用并提供 page 对象
 */

import { _electron as electron, test as base, type ElectronApplication, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'

let electronApp: ElectronApplication | null = null
let mainPage: Page | null = null

/**
 * 启动 Electron 应用（如果未启动）
 */
export async function launchElectronApp(): Promise<{ app: ElectronApplication; page: Page }> {
  if (electronApp && mainPage) {
    return { app: electronApp, page: mainPage }
  }

  // 查找打包后的应用
  const distPath = path.join(__dirname, '..', 'dist', 'main', 'index.mjs')
  const appPath = fs.existsSync(distPath) ? distPath : undefined

  electronApp = await electron.launch({
    args: appPath ? [appPath] : [path.join(__dirname, '..')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ELECTRON_ENABLE_LOGGING: '1',
    },
    timeout: 30000,
  })

  mainPage = await electronApp.firstWindow()
  await mainPage.waitForLoadState('domcontentloaded')

  // 等待应用加载完成 — 检查 root 内有内容且 textarea 可用
  await mainPage.waitForFunction(
    () => {
      const root = document.getElementById('root')
      if (!root || root.children.length === 0) return false
      return document.querySelector('textarea') !== null
    },
    { timeout: 15000 }
  ).catch(() => {
    // 容错：使用备选等待
    return mainPage!.waitForTimeout(5000)
  })

  return { app: electronApp, page: mainPage }
}

/**
 * 关闭 Electron 应用
 */
export async function closeElectronApp(): Promise<void> {
  if (electronApp) {
    await electronApp.close()
    electronApp = null
    mainPage = null
  }
}

/**
 * 等待应用就绪
 */
export async function waitForAppReady(page: Page, timeoutMs = 15000): Promise<void> {
  await page.waitForFunction(
    () => {
      // 检查关键元素是否存在
      const root = document.getElementById('root')
      if (!root || root.children.length === 0) return false
      // 检查是否有欢迎界面或聊天输入框
      const hasWelcome = document.querySelector('[data-testid="welcome-block"]') !== null
      const hasInput = document.querySelector('textarea') !== null
      return hasWelcome || hasInput
    },
    { timeout: timeoutMs }
  )
}
