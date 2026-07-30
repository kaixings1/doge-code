import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.test.ts',
  timeout: 30000,
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    headless: true,
  },
})
