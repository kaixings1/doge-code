/**
 * `--restricted` 受限模式的纯逻辑层。
 *
 * 对应官方语义（diff_with_claude.md §2.1）：
 *   1. 移除会执行命令/代码的内置工具（Bash、PowerShell、Python 解释器、Shell、Sandbox 等），
 *      以及 WebFetch —— 除非用户用 `--tools` 显式点名。
 *   2. 忽略 user / project / local 设置（managed 策略与 --settings 仍生效）。
 *   3. 拒绝 bypassPermissions。
 *
 * 这里只放不依赖运行时状态的判定，便于单测；接线在 main.tsx。
 */
import type { SettingSource } from './settings/constants.js'

/** CLI 标志与环境变量统一入口（与 envUtils.isSafeMode 同风格：argv 直接检查）。 */
export function isRestrictedMode(): boolean {
  return (
    process.env.CLAUDE_CODE_RESTRICTED === '1' ||
    process.argv.includes('--restricted')
  )
}

/**
 * 受限模式默认移除的工具名（规范名）。
 * 只覆盖"能执行命令或代码"的工具 + WebFetch；其它工具照常。
 *
 * 注意：与本地 fork 新增的扩展工具同步维护 —— 新增执行类工具时要加到此处。
 */
export const RESTRICTED_BLOCKED_TOOLS = [
  'Bash',
  'PowerShell',
  'Shell',
  'python_interpreter',
  'sandbox',
  'terminal-panel',
  'terminal_capture',
  'web_browser',
  'WebFetch',
] as const

export type RestrictedDisallowedResult = {
  /** 需要追加到 disallowedTools 的工具名。 */
  disallowed: string[]
  /** 用户通过 --tools 显式放行而被豁免的工具。 */
  exempted: string[]
}

/**
 * 计算受限模式下应禁止的工具。
 *
 * @param explicitTools 用户通过 `--tools` 显式指定的工具名（已被解析为规范名）
 * @param blocked 受限清单（可注入以便测试）
 */
export function computeRestrictedDisallowed(
  explicitTools: readonly string[],
  blocked: readonly string[] = RESTRICTED_BLOCKED_TOOLS,
): RestrictedDisallowedResult {
  const explicit = new Set(explicitTools.map(t => t.trim()).filter(Boolean))
  const disallowed: string[] = []
  const exempted: string[] = []
  for (const tool of blocked) {
    if (explicit.has(tool)) {
      exempted.push(tool)
    } else {
      disallowed.push(tool)
    }
  }
  return { disallowed, exempted }
}

/**
 * 受限模式下的有效设置源：只保留 policySettings（原生的默认值就是"全部"，
 * 受限于这里显式给出空列表）。若用户另外给了 --settings，flagSettings
 * 会由 getEnabledSettingSources 自动补上，不需要在这里列出。
 */
export function restrictedSettingSources(): SettingSource[] {
  return []
}

/** 受限模式下 bypassPermissions 是否应当被拒。 */
export function shouldRejectBypassPermissions(
  permissionMode: string | undefined,
  dangerouslySkipPermissions: boolean | undefined,
): boolean {
  return permissionMode === 'bypassPermissions' || dangerouslySkipPermissions === true
}

export const RESTRICTED_BYPASS_ERROR =
  '受限模式（--restricted）不允许 bypassPermissions / --dangerously-skip-permissions。'
