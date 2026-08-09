/**
 * Electron App 启动辅助 - Playwright E2E 测试
 *
 * 使用 Playwright 原生 Electron fixture，自动处理窗口选择。
 */

import { test as base, expect, type ElectronApplication, type Page } from '@playwright/test'

type AppFixture = { app: ElectronApplication; page: Page }

export const test = base.extend<AppFixture>({
  app: async ({}, use) => {
    const app = await base._electron.launch({
      args: ['.'],
      env: { ...process.env, NODE_ENV: 'test', ELECTRON_ENABLE_LOGGING: '1', DOGE_DEVTOOLS: '0' },
      timeout: 30000,
    })

    // 获取第一个非 DevTools 窗口
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(5000)

    await use({ app, page })

    await app.close()
  },
})

export { expect }
export async function launchElectronApp(): Promise<AppFixture> {
  throw new Error('Use the "app" fixture instead')
}

export async function closeElectronApp(): Promise<void> {
  // No-op, fixture handles cleanup
}
