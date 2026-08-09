/**
 * Electron Desktop 运行时 E2E 测试 (Playwright Runner)
 *
 * 使用 Playwright _electron API 启动 Electron 应用并验证 UI。
 * 通过 `npx playwright test e2e/app-e2e.spec.ts` 运行。
 *
 * 注意：需要先运行 `bun run build` 构建应用。
 */

import { test as baseTest, expect } from '@playwright/test'
import { launchElectronApp, closeElectronApp } from './electron-app.js'

const test = baseTest.extend<{
  app: { app: any; page: any }
}>({
  app: async ({}, use) => {
    const result = await launchElectronApp()
    await use(result)
    await closeElectronApp()
  },
})

test('应用标题包含 Doge', async ({ app: { page } }) => {
  const title = await page.title()
  expect(title).toMatch(/Doge|doge|DogeCode/i)
})

test('聊天输入框可见', async ({ app: { page } }) => {
  const textarea = await page.$('textarea')
  expect(textarea).not.toBeNull()
})

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

test('打开命令面板 (Ctrl+Shift+P)', async ({ app: { page } }) => {
  await page.keyboard.press('Control+Shift+p')
  await page.waitForTimeout(1000)
  const bodyText = await page.evaluate(() => document.body.innerText)
  expect(bodyText).toContain('⚡')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
})

test('打开设置面板 (Ctrl+,)', async ({ app: { page } }) => {
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

test('打开快捷键帮助 (?)', async ({ app: { page } }) => {
  await page.keyboard.press('?')
  await page.waitForTimeout(1000)
  const bodyText = await page.evaluate(() => document.body.innerText)
  expect(bodyText).toContain('快捷键')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
})
