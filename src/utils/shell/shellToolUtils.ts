import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js'
import { POWERSHELL_TOOL_NAME } from '../../tools/PowerShellTool/toolName.js'
import { isEnvDefinedFalsy, isEnvTruthy } from '../envUtils.js'
import { getPlatform } from '../platform.js'

export const SHELL_TOOL_NAMES: string[] = [BASH_TOOL_NAME, POWERSHELL_TOOL_NAME]

/**
 * Runtime gate for PowerShellTool. Windows-only (the permission engine uses
 * Win32-specific path normalizations). Ant defaults on (opt-out via env=0);
 * external defaults off (opt-in via env=1).
 *
 * Used by tools.ts (tool-list visibility), processBashCommand (! routing),
 * and promptShellExecution (skill frontmatter routing) so the gate is
 * consistent across all paths that invoke PowerShellTool.call().
 */
export function isPowerShellToolEnabled(): boolean {
  if (getPlatform() !== 'windows') return false
  return process.env.USER_TYPE === 'ant'
    ? !isEnvDefinedFalsy(process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL)
    : isEnvTruthy(process.env.CLAUDE_CODE_USE_POWERSHELL_TOOL)
}

/**
 * 统一的 Windows 底层 shell 判定 —— 供 BashTool 归一化层与 Shell.exec 共同使用，
 * 避免两处各自推导导致方向矛盾（历史上出现同一命令被 cmd/bash 来回翻转的 bug）。
 *
 * 语义（单一事实来源）：
 * - 非 Windows → 'bash'
 * - Windows 且未显式声明 cmd/powershell → 'cmd'（MSYS2 会破坏内联代码，默认禁用 bash）
 * - Windows 且 CLAUDE_CODE_SHELL_WANT_BASH=1 → 'bash'（用户显式授权）
 * - Windows 且 CLAUDE_CODE_SHELL 声明 cmd/powershell → 对应原生 shell
 *
 * @returns 'bash' | 'cmd' | 'powershell'
 */
export function resolveWindowsShellKind(): 'bash' | 'cmd' | 'powershell' {
  if (getPlatform() !== 'windows') return 'bash'
  if (process.env.CLAUDE_CODE_SHELL_WANT_BASH === '1') return 'bash'
  const shim = (process.env.CLAUDE_CODE_SHELL || '').toLowerCase()
  if (shim.includes('powershell') || shim.includes('pwsh')) return 'powershell'
  if (shim.includes('cmd')) return 'cmd'
  // 未显式声明 → 默认 cmd.exe
  return 'cmd'
}
