/**
 * Electron Desktop 运行时 E2E 测试 (Playwright Runner)
 *
 * 使用 Playwright _electron API 启动 Electron 应用并验证 UI。
 * 通过 `npx playwright test e2e/app-e2e.spec.ts` 运行。
 *
 * 注意：需要先运行 `bun run build` 构建应用。
 */

import { test, expect } from '@playwright/test'
import { _electron as electron } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const MAIN_PATH = path.join(ROOT, 'dist', 'main', 'index.mjs')

test.describe('Electron 应用运行时测试', () => {
  let app: any = null
  let page: any = null

  test.beforeAll(async () => {
    // 确保已构建
    if (!fs.existsSync(MAIN_PATH)) {
      throw new Error('请先运行 `bun run build` 构建应用')
    }

    app = await electron.launch({
      args: [MAIN_PATH],
      env: { ...process.env, NODE_ENV: 'test' },
      timeout: 30000,
    })

    page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')

    // 等待应用加载完成
    await page.waitForFunction(
      () => {
        const root = document.getElementById('root')
        if (!root || root.children.length === 0) return false
        return document.querySelector('textarea') !== null
      },
      { timeout: 15000 }
    ).catch(() => page.waitForTimeout(5000))
  })

  test.afterAll(async () => {
    if (app) await app.close()
  })

  test('应用标题包含 Doge', async () => {
    const title = await page.title()
    expect(title).toMatch(/Doge|doge|DogeCode/i)
  })

  test('聊天输入框可见', async () => {
    const textarea = await page.$('textarea')
    expect(textarea).not.toBeNull()
  })

  test('语音输入按钮可见', async () => {
    const btns = await page.$$('button')
    let found = false
    for (const btn of btns) {
      const text = await btn.textContent()
      if (text && (text.includes('🎤') || text.includes('语音'))) { found = true; break }
    }
    expect(found).toBe(true)
  })

  test('朗读按钮可见', async () => {
    const btns = await page.$$('button')
    let found = false
    for (const btn of btns) {
      const text = await btn.textContent()
      if (text && (text.includes('🔊') || text.includes('朗读'))) { found = true; break }
    }
    expect(found).toBe(true)
  })

  test('分屏/全屏按钮可见', async () => {
    const bodyText = await page.evaluate(() => document.body.innerText)
    expect(bodyText).toContain('分屏')
    expect(bodyText).toContain('全屏')
  })

  test('打开命令面板 (Ctrl+Shift+P)', async () => {
    await page.keyboard.press('Control+Shift+p')
    await page.waitForTimeout(1000)
    const bodyText = await page.evaluate(() => document.body.innerText)
    expect(bodyText).toContain('⚡')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })

  test('打开设置面板 (Ctrl+,)', async () => {
    await page.keyboard.press('Control+,')
    await page.waitForTimeout(1000)
    const bodyText = await page.evaluate(() => document.body.innerText)
    expect(bodyText).toContain('主题设置')
    expect(bodyText).toContain('深色')
    expect(bodyText).toContain('浅色')
    expect(bodyText).toContain('自动')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })

  test('打开快捷键帮助 (?)', async () => {
    await page.keyboard.press('?')
    await page.waitForTimeout(1000)
    const bodyText = await page.evaluate(() => document.body.innerText)
    expect(bodyText).toContain('快捷键')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })
})
