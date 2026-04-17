import { getDirectConnectServerUrl, getSessionId } from '../bootstrap/state.js'
import { stringWidth } from '../ink/stringWidth.js'
import type { LogOption } from '../types/logs.js'
import { getSubscriptionName, isClaudeAISubscriber } from './auth.js'
import { getCwd } from './cwd.js'
import { getDisplayPath } from './file.js'
import {
  truncate,
  truncateToWidth,
  truncateToWidthNoEllipsis,
} from './format.js'
import { getStoredChangelogFromMemory, parseChangelog } from './releaseNotes.js'
import { gt } from './semver.js'
import { loadMessageLogs } from './sessionStorage.js'
import { getInitialSettings } from './settings/settings.js'

// 布局常量
const MAX_LEFT_WIDTH = 50
const MAX_USERNAME_LENGTH = 20
const BORDER_PADDING = 4
const DIVIDER_WIDTH = 1
const CONTENT_PADDING = 2

export type LayoutMode = 'horizontal' | 'compact'

export type LayoutDimensions = {
  leftWidth: number
  rightWidth: number
  totalWidth: number
}

/**
 * 根据终端宽度确定布局模式
 */
export function getLayoutMode(columns: number): LayoutMode {
  if (columns >= 70) return 'horizontal'
  return 'compact'
}

/**
 * 计算 LogoV2 组件的布局尺寸
 */
export function calculateLayoutDimensions(
  columns: number,
  layoutMode: LayoutMode,
  optimalLeftWidth: number,
): LayoutDimensions {
  if (layoutMode === 'horizontal') {
    const leftWidth = optimalLeftWidth
    const usedSpace =
      BORDER_PADDING + CONTENT_PADDING + DIVIDER_WIDTH + leftWidth
    const availableForRight = columns - usedSpace

    let rightWidth = Math.max(30, availableForRight)
    const totalWidth = Math.min(
      leftWidth + rightWidth + DIVIDER_WIDTH + CONTENT_PADDING,
      columns - BORDER_PADDING,
    )

    // 如果总宽度受限，重新计算右侧宽度
    if (totalWidth < leftWidth + rightWidth + DIVIDER_WIDTH + CONTENT_PADDING) {
      rightWidth = totalWidth - leftWidth - DIVIDER_WIDTH - CONTENT_PADDING
    }

    return { leftWidth, rightWidth, totalWidth }
  }

  // 紧凑模式
  const totalWidth = Math.min(columns - BORDER_PADDING, MAX_LEFT_WIDTH + 20)
  return {
    leftWidth: totalWidth,
    rightWidth: totalWidth,
    totalWidth,
  }
}

/**
 * 基于内容计算左侧面板的最佳宽度
 */
export function calculateOptimalLeftWidth(
  welcomeMessage: string,
  truncatedCwd: string,
  modelLine: string,
): number {
  const contentWidth = Math.max(
    stringWidth(welcomeMessage),
    stringWidth(truncatedCwd),
    stringWidth(modelLine),
    20, // 为爪爪图案留出空间
  )
  return Math.min(contentWidth + 4, MAX_LEFT_WIDTH) // +4 为内边距
}

/**
 * 根据用户名格式化欢迎消息
 */
export function formatWelcomeMessage(username: string | null): string {
  if (!username || username.length > MAX_USERNAME_LENGTH) {
    return '欢迎回来！'
  }
  return `欢迎回来，${username}！`
}

/**
 * 如果路径过长，在中间截断（考虑中文字符宽度）
 */
export function truncatePath(path: string, maxLength: number): string {
  if (stringWidth(path) <= maxLength) return path

  const separator = '/'
  const ellipsis = '…'
  const ellipsisWidth = 1 // '…' 只占一列
  const separatorWidth = 1

  const parts = path.split(separator)
  const first = parts[0] || ''
  const last = parts[parts.length - 1] || ''
  const firstWidth = stringWidth(first)
  const lastWidth = stringWidth(last)

  // 只有一个部分，直接截断
  if (parts.length === 1) {
    return truncateToWidth(path, maxLength)
  }

  // 没有空间显示最后一部分，直接截断最后部分
  if (first === '' && ellipsisWidth + separatorWidth + lastWidth >= maxLength) {
    return `${separator}${truncateToWidth(last, Math.max(1, maxLength - separatorWidth))}`
  }

  // 有第一部分，显示省略号和截断的最后部分
  if (
    first !== '' &&
    ellipsisWidth * 2 + separatorWidth + lastWidth >= maxLength
  ) {
    return `${ellipsis}${separator}${truncateToWidth(last, Math.max(1, maxLength - ellipsisWidth - separatorWidth))}`
  }

  // 两部分：截断第一部分，保留最后部分
  if (parts.length === 2) {
    const availableForFirst =
      maxLength - ellipsisWidth - separatorWidth - lastWidth
    return `${truncateToWidthNoEllipsis(first, availableForFirst)}${ellipsis}${separator}${last}`
  }

  // 多个部分：保留首尾，尝试保留中间部分
  let available =
    maxLength - firstWidth - lastWidth - ellipsisWidth - 2 * separatorWidth

  // 首尾本身已经太长，只截断首部
  if (available <= 0) {
    const availableForFirst = Math.max(
      0,
      maxLength - lastWidth - ellipsisWidth - 2 * separatorWidth,
    )
    const truncatedFirst = truncateToWidthNoEllipsis(first, availableForFirst)
    return `${truncatedFirst}${separator}${ellipsis}${separator}${last}`
  }

  // 尝试保留尽可能多的中间部分
  const middleParts = []
  for (let i = parts.length - 2; i > 0; i--) {
    const part = parts[i]
    if (part && stringWidth(part) + separatorWidth <= available) {
      middleParts.unshift(part)
      available -= stringWidth(part) + separatorWidth
    } else {
      break
    }
  }

  if (middleParts.length === 0) {
    return `${first}${separator}${ellipsis}${separator}${last}`
  }

  return `${first}${separator}${ellipsis}${separator}${middleParts.join(separator)}${separator}${last}`
}

// 简单缓存最近活动
let cachedActivity: LogOption[] = []
let cachePromise: Promise<LogOption[]> | null = null

/**
 * 预加载最近对话记录，用于 Logo v2 展示
 */
export async function getRecentActivity(): Promise<LogOption[]> {
  if (cachePromise) {
    return cachePromise
  }

  const currentSessionId = getSessionId()
  cachePromise = loadMessageLogs(10)
    .then(logs => {
      cachedActivity = logs
        .filter(log => {
          if (log.isSidechain) return false
          if (log.sessionId === currentSessionId) return false
          if (log.summary?.includes('I apologize')) return false

          // 过滤掉 summary 和 firstPrompt 均为空的记录
          const hasSummary = log.summary && log.summary !== 'No prompt'
          const hasFirstPrompt =
            log.firstPrompt && log.firstPrompt !== 'No prompt'
          return hasSummary || hasFirstPrompt
        })
        .slice(0, 3)
      return cachedActivity
    })
    .catch(() => {
      cachedActivity = []
      return cachedActivity
    })

  return cachePromise
}

/**
 * 同步获取缓存的最近活动
 */
export function getRecentActivitySync(): LogOption[] {
  return cachedActivity
}

/**
 * 格式化发布说明用于展示，并进行智能截断
 */
export function formatReleaseNoteForDisplay(
  note: string,
  maxWidth: number,
): string {
  // 和最近活动的描述一样，直接截断到最大宽度
  return truncate(note, maxWidth)
}

/**
 * 获取 LogoV2 和 CondensedLogo 共用的 Logo 显示数据
 */
export function getLogoDisplayData(): {
  version: string
  cwd: string
  billingType: string
  agentName: string | undefined
} {
  const version = process.env.DEMO_VERSION ?? MACRO.VERSION
  const serverUrl = getDirectConnectServerUrl()
  const displayPath = process.env.DEMO_VERSION
    ? '/code/claude'
    : getDisplayPath(getCwd())
  const cwd = serverUrl
    ? `${displayPath} 位于 ${serverUrl.replace(/^https?:\/\//, '')}`
    : displayPath
  const billingType = isClaudeAISubscriber()
    ? getSubscriptionName()
    : 'API 使用免费！'
  const agentName = getInitialSettings().agent

  return {
    version,
    cwd,
    billingType,
    agentName,
  }
}

/**
 * 根据可用宽度决定模型和计费信息的展示方式（是否拆分为两行）
 */
export function formatModelAndBilling(
  modelName: string,
  billingType: string,
  availableWidth: number,
): {
  shouldSplit: boolean
  truncatedModel: string
  truncatedBilling: string
} {
  const separator = ' · '
  const combinedWidth =
    stringWidth(modelName) + separator.length + stringWidth(billingType)
  const shouldSplit = combinedWidth > availableWidth

  if (shouldSplit) {
    return {
      shouldSplit: true,
      truncatedModel: truncate(modelName, availableWidth),
      truncatedBilling: truncate(billingType, availableWidth),
    }
  }

  return {
    shouldSplit: false,
    truncatedModel: truncate(
      modelName,
      Math.max(
        availableWidth - stringWidth(billingType) - separator.length,
        10,
      ),
    ),
    truncatedBilling: billingType,
  }
}

/**
 * 获取用于 Logo v2 展示的最近更新说明
 * - 蚂蚁内部用户：使用构建时打包的 commits
 * - 外部用户：使用公开的 changelog
 */
export function getRecentReleaseNotesSync(maxItems: number): string[] {
  // 蚂蚁内部用户使用打包的 changelog
  if (process.env.USER_TYPE === 'ant') {
    const changelog = MACRO.VERSION_CHANGELOG
    if (changelog) {
      const commits = changelog.trim().split('\n').filter(Boolean)
      return commits.slice(0, maxItems)
    }
    return []
  }

  const changelog = getStoredChangelogFromMemory()
  if (!changelog) {
    return []
  }

  let parsed
  try {
    parsed = parseChangelog(changelog)
  } catch {
    return []
  }

  // 获取最近几个版本的更新内容
  const allNotes: string[] = []
  const versions = Object.keys(parsed)
    .sort((a, b) => (gt(a, b) ? -1 : 1))
    .slice(0, 3) // 查看最近 3 个版本

  for (const version of versions) {
    const notes = parsed[version]
    if (notes) {
      allNotes.push(...notes)
    }
  }

  return allNotes.slice(0, maxItems)
}