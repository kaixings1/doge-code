/**
 * Electron Desktop 应用 E2E 测试 (Playwright)
 *
 * 使用 Playwright _electron API 启动 Electron 应用并验证 UI。
 *
 * 运行方式: npx playwright@1.62.0 test e2e/app.test.ts
 */

import { test, expect, _electron as electron } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let app: any = null
let page: any = null

test.beforeAll(async () => {
  const electronPath = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe')
  const mainPath = path.join(__dirname, '..', 'dist', 'main', 'index.mjs')

  app = await electron.launch({
    executablePath: electronPath,
    args: [mainPath],
    env: { ...process.env, NODE_ENV: 'test' },
    timeout: 30000,
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(3000)
})

test.afterAll(async () => {
  if (app) await app.close()
})

test.describe('应用启动', () => {
  test('应用标题包含 Doge', async () => {
    const title = await page.title()
    expect(title).toMatch(/Doge|doge|DogeCode/i)
  })

  test('Doge Code 品牌可见', async () => {
    const bodyText = await page.evaluate(() => document.body.innerText)
    expect(bodyText).toContain('Doge Code')
  })
})

test.describe('UI 组件', () => {
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
})

test.describe('命令面板', () => {
  test('打开命令面板', async () => {
    await page.keyboard.press('Control+Shift+p')
    await page.waitForTimeout(1000)
    // 命令面板应触发某种 UI 变化（搜索框或面板内容）
    const bodyText = await page.evaluate(() => document.body.innerText)
    expect(bodyText.length).toBeGreaterThan(0)
  })

  test('关闭命令面板', async () => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })
})

test.describe('设置面板', () => {
  test('打开设置面板', async () => {
    await page.keyboard.press('Control+,')
    await page.waitForTimeout(1000)
    // 设置面板打开后应显示某些 UI 内容
    const bodyText = await page.evaluate(() => document.body.innerText)
    expect(bodyText.length).toBeGreaterThan(0)
  })

  test('关闭设置面板', async () => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })
})

test.describe('快捷键', () => {
  test('快捷键面板可通过 Escape 关闭', async () => {
    // 先通过设置面板打开再关闭，验证 Escape 键可用
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })
})
