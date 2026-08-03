import { readFileSync, writeFileSync } from 'fs'
import { logForDebugging } from '../debug.js'
import { jsonStringify } from '../slowOperations.js'
import { validatePermissionRule } from './permissionValidation.js'

/**
 * 自动修复 settings.json 中 permissions 数组里的无效规则（如括号不匹配）。
 * 删除无效行，保留其他所有配置不变，然后写回磁盘。
 */
export function repairSettingsFile(): void {
  const files = getSettingsFilePaths()
  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content)
      if (!data || typeof data !== 'object') continue

      const perms = data.permissions
      if (!perms || typeof perms !== 'object') continue

      let changed = false
      for (const key of ['allow', 'deny', 'ask'] as const) {
        const rules = perms[key]
        if (!Array.isArray(rules)) continue

        const valid: string[] = []
        for (const rule of rules) {
          if (typeof rule !== 'string') continue
          const result = validatePermissionRule(rule)
          if (result.valid) {
            valid.push(rule)
          } else {
            logForDebugging(
              `[修复] permissions.${key} 删除无效规则: "${rule}" — ${result.error}`,
            )
            changed = true
          }
        }
        perms[key] = valid
      }

      if (changed) {
        writeFileSync(filePath, jsonStringify(data, null, 2) + '\n', 'utf-8')
        logForDebugging(`[修复] 已清理 ${filePath} 中的 permissions 无效规则`)
      }
    } catch {
      // 跳过无法解析的文件
    }
  }
}

function getSettingsFilePaths(): string[] {
  const paths: string[] = []
  const { homedir } = require('os')
  const { join } = require('path')
  const { existsSync } = require('fs')

  // 全局 settings
  const userPath = join(homedir(), '.doge', 'settings.json')
  if (existsSync(userPath)) paths.push(userPath)

  // 项目 settings
  const projectPath = join(process.cwd(), '.claude', 'settings.json')
  if (existsSync(projectPath)) paths.push(projectPath)

  // 项目 local settings
  const localPath = join(process.cwd(), '.claude', 'settings.local.json')
  if (existsSync(localPath)) paths.push(localPath)

  return paths
}
