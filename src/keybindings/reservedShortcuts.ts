import { getPlatform } from '../utils/platform.js'

/**
 * 通常被操作系统、终端或 shell 拦截且很可能
 * 永远不会到达应用程序的快捷键。
 */
export type ReservedShortcut = {
  key: string
  reason: string
  severity: 'error' | 'warning'
}

/**
 * 无法重新绑定的快捷键——它们在 Claude Code 中是硬编码的。
 */
export const NON_REBINDABLE: ReservedShortcut[] = [
  {
    key: 'ctrl+c',
    reason: '无法重新绑定 - 用于中断/退出（硬编码）',
    severity: 'error',
  },
  {
    key: 'ctrl+d',
    reason: '无法重新绑定 - 用于退出（硬编码）',
    severity: 'error',
  },
  {
    key: 'ctrl+m',
    reason:
      '无法重新绑定 - 在终端中与 Enter 相同（都发送 CR）',
    severity: 'error',
  },
]

/**
 * 被终端/OS 拦截的终端控制快捷键。
 * 这些很可能永远不会到达应用程序。
 *
 * 注意：ctrl+s（XOFF）和 ctrl+q（XON）未包含在此处，因为：
 * - 大多数现代终端默认禁用流控制
 * - 我们使用 ctrl+s 作为 stash 功能
 */
export const TERMINAL_RESERVED: ReservedShortcut[] = [
  {
    key: 'ctrl+z',
    reason: 'Unix 进程挂起 (SIGTSTP)',
    severity: 'warning',
  },
  {
    key: 'ctrl+\\',
    reason: '终端退出信号 (SIGQUIT)',
    severity: 'error',
  },
]

/**
 * macOS 特有的被操作系统拦截的快捷键。
 */
export const MACOS_RESERVED: ReservedShortcut[] = [
  { key: 'cmd+c', reason: 'macOS 系统复制', severity: 'error' },
  { key: 'cmd+v', reason: 'macOS 系统粘贴', severity: 'error' },
  { key: 'cmd+x', reason: 'macOS 系统剪切', severity: 'error' },
  { key: 'cmd+q', reason: 'macOS 退出应用程序', severity: 'error' },
  { key: 'cmd+w', reason: 'macOS 关闭窗口/标签', severity: 'error' },
  { key: 'cmd+tab', reason: 'macOS 应用程序切换器', severity: 'error' },
  { key: 'cmd+space', reason: 'macOS Spotlight 搜索', severity: 'error' },
]

/**
 * 获取当前平台所有被保留的快捷键。
 * 包括不可重新绑定的快捷键和终端保留的快捷键。
 */
export function getReservedShortcuts(): ReservedShortcut[] {
  const platform = getPlatform()
  // 不可重新绑定的快捷键优先（最高优先级）
  const reserved = [...NON_REBINDABLE, ...TERMINAL_RESERVED]

  if (platform === 'macos') {
    reserved.push(...MACOS_RESERVED)
  }

  return reserved
}

/**
 * 标准化按键字符串以进行比较（小写、排序修饰键）。
 * 和弦（空格分隔的步骤，如 "ctrl+x ctrl+b"）按步骤
 * 标准化——先按 '+' 拆分会将 "x ctrl" 变为被下一步覆盖的
 * mainKey，从而将和弦折叠为其最后一个键。
 */
export function normalizeKeyForComparison(key: string): string {
  return key.trim().split(/\s+/).map(normalizeStep).join(' ')
}

function normalizeStep(step: string): string {
  const parts = step.split('+')
  const modifiers: string[] = []
  let mainKey = ''

  for (const part of parts) {
    const lower = part.trim().toLowerCase()
    if (
      [
        'ctrl',
        'control',
        'alt',
        'opt',
        'option',
        'meta',
        'cmd',
        'command',
        'shift',
      ].includes(lower)
    ) {
      // 标准化修饰键名称
      if (lower === 'control') modifiers.push('ctrl')
      else if (lower === 'option' || lower === 'opt') modifiers.push('alt')
      else if (lower === 'command' || lower === 'cmd') modifiers.push('cmd')
      else modifiers.push(lower)
    } else {
      mainKey = lower
    }
  }

  modifiers.sort()
  return [...modifiers, mainKey].join('+')
}
