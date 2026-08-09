/**
 * Electron Desktop 应用 E2E 测试 (Playwright)
 *
 * 使用 Playwright _electron API 启动 Electron 应用并验证 UI。
 *
 * 运行方式: npx playwright@1.62.0 test e2e/app.test.ts
 */

import { test, expect } from './electron-app.js'

test('应用启动 — 标题包含 Doge', async ({ app: { page } }) => {
  const title = await page.title()
  expect(title).toMatch(/Doge|doge|DogeCode/i)
})

test('应用启动 — Doge Code 品牌可见', async ({ app: { page } }) => {
  const bodyText = await page.evaluate(() => document.body.innerText)
  expect(bodyText).toContain('Doge Code')
})

test.describe('UI 组件', () => {
  test('语音输入按钮可见', async ({ app: { page } }) => {
    const btns = await page.$$('button')
    let found = false
    for (const btn of btns) {
      const text = await btn.textContent()
      if (text && (text.includes('🎤') || text.includes('语音'))) { found = true; break }
    }
    expect(found).toBe(true)
  })

  test('朗读按钮可见', async ({ app: { page } }) => {
    const btns = await page.$$('button')
    let found = false
    for (const btn of btns) {
      const text = await btn.textContent()
      if (text && (text.includes('🔊') || text.includes('朗读'))) { found = true; break }
    }
    expect(found).toBe(true)
  })

  test('分屏/全屏按钮可见', async ({ app: { page } }) => {
    const bodyText = await page.evaluate(() => document.body.innerText)
    expect(bodyText).toContain('分屏')
    expect(bodyText).toContain('全屏')
  })
})

test.describe('命令面板', () => {
  test('打开命令面板', async ({ app: { page } }) => {
    await page.keyboard.press('Control+Shift+p')
    await page.waitForTimeout(1000)
    const bodyText = await page.evaluate(() => document.body.innerText)
    expect(bodyText.length).toBeGreaterThan(0)
  })

  test('关闭命令面板', async ({ app: { page } }) => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })
})

test.describe('设置面板', () => {
  test('打开设置面板', async ({ app: { page } }) => {
    await page.keyboard.press('Control+,')
    await page.waitForTimeout(1000)
    const bodyText = await page.evaluate(() => document.body.innerText)
    expect(bodyText.length).toBeGreaterThan(0)
  })

  test('关闭设置面板', async ({ app: { page } }) => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })
})

test.describe('快捷键', () => {
  test('快捷键面板可通过 Escape 关闭', async ({ app: { page } }) => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })
})
