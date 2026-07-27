/**
 * Electron Desktop 应用 E2E 测试 (Bun Test Runner)
 *
 * 使用 Playwright _electron API 启动 Electron 应用并验证 UI。
 * 注意：Windows 上 Playwright Electron 集成需要特定配置。
 *
 * 运行方式: bun test e2e/app.test.ts
 */

import { test, expect, describe, beforeAll, afterAll } from 'bun:test'
import { _electron as electron } from '@playwright/test'
import * as path from 'path'

let app: any = null
let page: any = null

beforeAll(async () => {
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

afterAll(async () => {
  if (app) await app.close()
})

describe('应用启动', () => {
  test('应用标题包含 Doge', async () => {
    const title = await page.title()
    expect(title).toMatch(/Doge|doge|DogeCode/i)
  })

  test('欢迎界面可见', async () => {
    const bodyText = await page.evaluate(() => document.body.innerText)
    expect(bodyText).toContain('输入消息开始对话')
  })
})

describe('UI 组件', () => {
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

describe('命令面板', () => {
  test('打开命令面板', async () => {
    await page.keyboard.press('Control+Shift+p')
    await page.waitForTimeout(1000)
    const bodyText = await page.evaluate(() => document.body.innerText)
    expect(bodyText).toContain('⚡')
  })

  test('关闭命令面板', async () => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })
})

describe('设置面板', () => {
  test('打开设置面板', async () => {
    await page.keyboard.press('Control+,')
    await page.waitForTimeout(1000)
    const bodyText = await page.evaluate(() => document.body.innerText)
    expect(bodyText).toContain('主题设置')
  })

  test('显示主题按钮', async () => {
    const bodyText = await page.evaluate(() => document.body.innerText)
    expect(bodyText).toContain('深色')
    expect(bodyText).toContain('浅色')
    expect(bodyText).toContain('自动')
  })

  test('关闭设置面板', async () => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })
})

describe('快捷键', () => {
  test('打开快捷键帮助', async () => {
    await page.keyboard.press('?')
    await page.waitForTimeout(1000)
    const bodyText = await page.evaluate(() => document.body.innerText)
    expect(bodyText).toContain('快捷键')
  })

  test('关闭快捷键面板', async () => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  })
})
