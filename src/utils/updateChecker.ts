/**
 * updateChecker.ts — 自动更新检查器
 *
 * 定期检查 dogo-code 是否有新版本可用。
 * 在 REPL 启动时静默检查，有新版本时在状态栏提示。
 */

import { execFileSync } from 'child_process'
import { join } from 'path'
import { homedir } from 'os'

const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000 // 24 hours
const DOGE_HOME = process.env.DOGE_HOME ?? homedir()
const UPDATE_CACHE_FILE = join(DOGE_HOME, '.doge', '.update-check-cache')

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string | null
  hasUpdate: boolean
  lastChecked: string
}

let cachedResult: UpdateInfo | null = null

/**
 * Get the current installed version of dogo-code.
 */
export function getCurrentVersion(): string {
  try {
    const pkg = require('../../package.json')
    return pkg.version || 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Check npm registry for the latest version.
 */
export async function checkForUpdates(force = false): Promise<UpdateInfo> {
  const currentVersion = getCurrentVersion()

  // Skip check if checked recently (unless forced)
  if (!force && cachedResult) {
    const lastChecked = new Date(cachedResult.lastChecked).getTime()
    if (Date.now() - lastChecked < UPDATE_CHECK_INTERVAL) {
      return cachedResult
    }
  }

  // Skip in CI/test environments
  if (process.env.CI || process.env.NODE_ENV === 'test') {
    return {
      currentVersion,
      latestVersion: null,
      hasUpdate: false,
      lastChecked: new Date().toISOString(),
    }
  }

  let latestVersion: string | null = null

  try {
    const result = execFileSync('npm', ['view', '@doge-code/cli', 'version', '--json'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    latestVersion = result.trim().replace(/"/g, '')
  } catch {
    // Network error or package not found — silently skip
  }

  cachedResult = {
    currentVersion,
    latestVersion,
    hasUpdate: latestVersion !== null && latestVersion !== currentVersion,
    lastChecked: new Date().toISOString(),
  }

  return cachedResult
}

/**
 * Get cached update info without making a network request.
 */
export function getCachedUpdateInfo(): UpdateInfo | null {
  return cachedResult
}

/**
 * Format update info as a user-friendly message.
 */
export function formatUpdateMessage(info: UpdateInfo): string | null {
  if (!info.hasUpdate || !info.latestVersion) {
    return null
  }

  return [
    `🔄 有新版本可用: v${info.latestVersion} (当前 v${info.currentVersion})`,
    `   运行 bun update -g @doge-code/cli 升级`,
  ].join('\n')
}

/**
 * Clear the update check cache.
 */
export function clearUpdateCache(): void {
  cachedResult = null
  try {
    const { unlinkSync } = require('fs')
    if (require('fs').existsSync(UPDATE_CACHE_FILE)) {
      unlinkSync(UPDATE_CACHE_FILE)
    }
  } catch {
    // ignore
  }
}
