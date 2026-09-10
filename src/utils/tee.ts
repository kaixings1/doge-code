/**
 * 双向 Tee（分叉输出）模块。
 *
 * 通过环境变量 CLAUDE_CODE_TEE 控制：
 *   - 未设置：关闭（默认）
 *   - stdout：镜像到 stdout
 *   - stderr：镜像到 stderr
 *   - <file path>：镜像到指定文件（追加模式）
 *
 * 行为：
 *   - 输出镜像：所有写入 stdout 的内容（AI 回复、工具输出等）
 *     同时写一份到目标。
 *   - 输入镜像：从 stdin 读取的用户输入也会写一份到目标。
 *
 * 典型用法：
 *   CLAUDE_CODE_TEE=stdout doge          # 同时输出到两个控制台
 *   CLAUDE_CODE_TEE=/tmp/tee.log doge    # 同时输出到日志文件
 */

import { appendFile, writeFile } from 'fs/promises'
import { isEnvTruthy } from './envUtils.js'
import { logForDebugging } from './debug.js'

type TeeTarget = 'stdout' | 'stderr' | { type: 'file'; path: string }

let cachedTarget: TeeTarget | null | undefined

function getTeeTarget(): TeeTarget | null {
  if (cachedTarget !== undefined) return cachedTarget

  const raw = (process.env.CLAUDE_CODE_TEE ?? '').trim()
  if (!raw) {
    cachedTarget = null
    return null
  }

  if (raw === 'stdout' || raw === 'stderr') {
    cachedTarget = raw
    return cachedTarget
  }

  // 视为文件路径
  cachedTarget = { type: 'file', path: raw }
  return cachedTarget
}

export function isTeeEnabled(): boolean {
  return getTeeTarget() !== null
}

/** 重置缓存（测试用） */
export function resetTeeCache(): void {
  cachedTarget = undefined
}

async function writeTee(data: string): Promise<void> {
  const target = getTeeTarget()
  if (!target) return

  try {
    if (target === 'stdout') {
      process.stdout.write(data)
    } else if (target === 'stderr') {
      process.stderr.write(data)
    } else if (target.type === 'file') {
      await appendFile(target.path, data)
    }
  } catch (e) {
    logForDebugging(`[tee] 写入目标失败: ${e}`, { level: 'debug' })
  }
}

/** 同步写入 tee（用于需要立即刷新的场景） */
export function writeTeeSync(data: string): void {
  const target = getTeeTarget()
  if (!target) return

  try {
    if (target === 'stdout') {
      process.stdout.write(data)
    } else if (target === 'stderr') {
      process.stderr.write(data)
    } else if (target.type === 'file') {
      // 文件写入无法同步安全完成，使用同步 API
      const { writeFileSync } = require('fs')
      writeFileSync(target.path, data, { flag: 'a' })
    }
  } catch (e) {
    logForDebugging(`[tee] 同步写入目标失败: ${e}`, { level: 'debug' })
  }
}

/** 异步写入 tee（不阻塞主流程） */
export function writeTeeAsync(data: string): void {
  void writeTee(data).catch(() => {})
}