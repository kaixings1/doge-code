/**
 * Dogerules — 持久化规则系统
 *
 * 类似 Cursor 的 .cursorrules，提供跨会话的持久化指令。
 * 规则文件按以下顺序加载（后者优先级更高）：
 *
 * 1. 全局规则（~/.doge/dogerules）—— 适用于所有项目的私有规则
 * 2. 项目规则（项目根目录下的 .dogerules）—— 签入代码库的团队规则
 * 3. 本地规则（项目根目录下的 .dogerules.local）—— 个人项目规则
 *
 * 规则会注入到系统提示中，对所有 AI 交互生效。
 */

import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { getClaudeConfigHomeDir } from './envUtils.js'

export interface DogerulesEntry {
  /** 规则来源路径 */
  path: string
  /** 规则内容 */
  content: string
  /** 优先级（数字越大优先级越高） */
  priority: number
  /** 来源类型 */
  type: 'global' | 'project' | 'local'
}

/**
 * 查找并加载所有 .dogerules 文件
 */
export function loadDogerules(projectRoot?: string): DogerulesEntry[] {
  const entries: DogerulesEntry[] = []

  // 1. 全局规则 ~/.doge/dogerules
  try {
    const globalRulesPath = join(getClaudeConfigHomeDir(), 'dogerules')
    if (existsSync(globalRulesPath)) {
      const content = readFileSync(globalRulesPath, 'utf-8').trim()
      if (content) {
        entries.push({
          path: globalRulesPath,
          content,
          priority: 1,
          type: 'global',
        })
      }
    }
  } catch {
    // 忽略读取错误
  }

  // 2. 项目规则 .dogerules
  const root = projectRoot || process.cwd()
  try {
    const projectRulesPath = join(root, '.dogerules')
    if (existsSync(projectRulesPath)) {
      const content = readFileSync(projectRulesPath, 'utf-8').trim()
      if (content) {
        entries.push({
          path: projectRulesPath,
          content,
          priority: 2,
          type: 'project',
        })
      }
    }
  } catch {
    // 忽略读取错误
  }

  // 3. 本地规则 .dogerules.local
  try {
    const localRulesPath = join(root, '.dogerules.local')
    if (existsSync(localRulesPath)) {
      const content = readFileSync(localRulesPath, 'utf-8').trim()
      if (content) {
        entries.push({
          path: localRulesPath,
          content,
          priority: 3,
          type: 'local',
        })
      }
    }
  } catch {
    // 忽略读取错误
  }

  // 按优先级排序
  return entries.sort((a, b) => a.priority - b.priority)
}

/**
 * 格式化规则为系统提示注入格式
 */
export function formatDogerulesForSystemPrompt(entries: DogerulesEntry[]): string {
  if (entries.length === 0) return ''

  const sections: string[] = []
  sections.push('## 持久化规则 (Dogerules)')
  sections.push('')
  sections.push('以下是用户定义的持久化规则。这些规则对所有交互都有效，你必须严格遵守。')
  sections.push('')

  for (const entry of entries) {
    const typeLabel =
      entry.type === 'global' ? '全局规则' :
      entry.type === 'project' ? '项目规则' : '本地规则'
    sections.push(`### [${typeLabel}] ${entry.path}`)
    sections.push('')
    sections.push(entry.content)
    sections.push('')
  }

  sections.push('---')
  sections.push('')

  return sections.join('\n')
}

/**
 * 检查是否存在规则文件
 */
export function hasDogerules(projectRoot?: string): boolean {
  const root = projectRoot || process.cwd()
  return (
    existsSync(join(getClaudeConfigHomeDir(), 'dogerules')) ||
    existsSync(join(root, '.dogerules')) ||
    existsSync(join(root, '.dogerules.local'))
  )
}
