import * as fs from 'fs'
import * as path from 'path'
import type { LocalCommandCall } from '../../types/command.js'
import { logForDebugging } from '../../utils/debug.js'
import { resetCostState } from '../../bootstrap/state.js'

/**
 * 重置 token 统计数据：
 * 1. 清空 .doge/api.json 中当前活跃预设的 token 统计
 * 2. 重置 STATE.modelUsage（实时 token 计数）
 */
export const call: LocalCommandCall = async () => {
  const projectConfigPath = path.join(process.cwd(), '.doge', 'api.json')
  let diskResetDone = false
  let memoryResetDone = false

  // 1. 重置磁盘上的 token 统计
  if (fs.existsSync(projectConfigPath)) {
    try {
      const raw = fs.readFileSync(projectConfigPath, 'utf-8')
      const data = JSON.parse(raw)
      if (data && typeof data === 'object') {
        const project = data as {
          activePreset?: string
          presets?: Record<string, { tokens?: Record<string, number> }>
        }

        const preset = project.activePreset && project.presets?.[project.activePreset]
        if (preset?.tokens) {
          // 全部清零：token、JSON 字节、金额全部重置
          preset.tokens = {
            sent: 0,
            received: 0,
            current: 0,
            sessionTotal: 0,
            currentSessionTotal: 0,
            jsonSentBytes: 0,
            jsonReceivedBytes: 0,
          }

          fs.writeFileSync(projectConfigPath, JSON.stringify(data, null, 2), 'utf-8')
          diskResetDone = true
          logForDebugging('[rstk] 已重置活跃预设的 token 统计')
        }
      }
    } catch (e) {
      logForDebugging('[rstk] 读取 api.json 失败: ' + e, { level: 'error' })
    }
  }

  // 2. 重置全部内存状态（cost、duration、lines、modelUsage 等）
  try {
    resetCostState()
    memoryResetDone = true
  } catch (e) {
    logForDebugging('[rstk] 重置内存状态失败: ' + e, { level: 'error' })
  }

  // 3. 触发状态栏刷新信号
  ;(globalThis as Record<string, unknown>).__RSTK_REFRESH_TS__ = Date.now()

  // 构建响应
  const parts: string[] = []
  if (diskResetDone) parts.push('磁盘 token 统计')
  if (memoryResetDone) parts.push('内存 token 计数')

  const message = parts.length > 0
    ? '✅ Token 统计数据已重置：' + parts.join('、')
    : '⚠️ 未找到活跃预设的 token 数据，已重置内存统计'

  return { type: 'text', value: message }
}
