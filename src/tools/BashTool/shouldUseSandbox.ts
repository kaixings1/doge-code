import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import { splitCommand_DEPRECATED } from '../../utils/bash/commands.js'
import { SandboxManager } from '../../utils/sandbox/sandbox-adapter.js'
import { getSettings_DEPRECATED } from '../../utils/settings/settings.js'
import {
  BINARY_HIJACK_VARS,
  bashPermissionRule,
  matchWildcardPattern,
  stripAllLeadingEnvVars,
  stripSafeWrappers,
} from './bashPermissions.js'

type SandboxInput = {
  command?: string
  dangerouslyDisableSandbox?: boolean
}

// 注意：excludedCommands 是面向用户的便利功能，并非安全边界。
// 绕过 excludedCommands 不是安全漏洞——沙箱权限系统
//（向用户发起提示）才是实际的安全控制手段。
function containsExcludedCommand(command: string): boolean {
  // 检查动态配置中的禁用命令和子字符串（仅限蚂蚁用户）
  if (process.env.USER_TYPE === 'ant') {
    const disabledCommands = getFeatureValue_CACHED_MAY_BE_STALE<{
      commands: string[]
      substrings: string[]
    }>('tengu_sandbox_disabled_commands', { commands: [], substrings: [] })

    // 检查命令是否包含任何禁用的子字符串
    for (const substring of disabledCommands.substrings) {
      if (command.includes(substring)) {
        return true
      }
    }

    // 检查命令是否以任何禁用命令开头
    try {
      const commandParts = splitCommand_DEPRECATED(command)
      for (const part of commandParts) {
        const baseCommand = part.trim().split(' ')[0]
        if (baseCommand && disabledCommands.commands.includes(baseCommand)) {
          return true
        }
      }
    } catch {
      // 如果无法解析命令（例如 bash 语法格式错误），
      // 将其视为未排除，以允许其他验证检查处理
      // 这可以防止渲染工具使用消息时崩溃
    }
  }

  // 检查设置中用户配置的排除命令
  const settings = getSettings_DEPRECATED()
  const userExcludedCommands = settings.sandbox?.excludedCommands ?? []

  if (userExcludedCommands.length === 0) {
    return false
  }

  // 将复合命令（例如 "docker ps && curl evil.com"）拆分为单个子命令，
  // 并检查每个子命令是否匹配排除模式。这可以防止复合命令仅因为其
  // 第一个子命令匹配排除模式而绕过沙箱。
  let subcommands: string[]
  try {
    subcommands = splitCommand_DEPRECATED(command)
  } catch {
    subcommands = [command]
  }

  for (const subcommand of subcommands) {
    const trimmed = subcommand.trim()
    // 同时尝试匹配去除环境变量前缀和包装命令后的结果，使
    // `FOO=bar bazel ...` 和 `timeout 30 bazel ...` 能匹配 `bazel:*`。
    // 这不是安全边界（见顶部的注意）；上面的 && 拆分已经让
    // `export FOO=bar && bazel ...` 可以匹配。BINARY_HIJACK_VARS 作为启发式保留。
    //
    // 我们迭代地应用两种剥离操作，直到不再产生新的候选
    //（不动点），与 filterRulesByContentsMatchingInput 的方法一致。
    // 这可以处理交错模式，例如 `timeout 300 FOO=bar bazel run`
    // 这类单次组合会失败的情况。
    const candidates = [trimmed]
    const seen = new Set(candidates)
    let startIdx = 0
    while (startIdx < candidates.length) {
      const endIdx = candidates.length
      for (let i = startIdx; i < endIdx; i++) {
        const cmd = candidates[i]!
        const envStripped = stripAllLeadingEnvVars(cmd, BINARY_HIJACK_VARS)
        if (!seen.has(envStripped)) {
          candidates.push(envStripped)
          seen.add(envStripped)
        }
        const wrapperStripped = stripSafeWrappers(cmd)
        if (!seen.has(wrapperStripped)) {
          candidates.push(wrapperStripped)
          seen.add(wrapperStripped)
        }
      }
      startIdx = endIdx
    }

    for (const pattern of userExcludedCommands) {
      const rule = bashPermissionRule(pattern)
      for (const cand of candidates) {
        switch (rule.type) {
          case 'prefix':
            if (cand === rule.prefix || cand.startsWith(rule.prefix + ' ')) {
              return true
            }
            break
          case 'exact':
            if (cand === rule.command) {
              return true
            }
            break
          case 'wildcard':
            if (matchWildcardPattern(rule.pattern, cand)) {
              return true
            }
            break
        }
      }
    }
  }

  return false
}

export function shouldUseSandbox(input: Partial<SandboxInput>): boolean {
  if (!SandboxManager.isSandboxingEnabled()) {
    return false
  }

  // 如果明确覆盖且策略允许非沙箱命令，则不使用沙箱
  if (
    input.dangerouslyDisableSandbox &&
    SandboxManager.areUnsandboxedCommandsAllowed()
  ) {
    return false
  }

  if (!input.command) {
    return false
  }

  // 如果命令包含用户配置的排除命令，则不使用沙箱
  if (containsExcludedCommand(input.command)) {
    return false
  }

  return true
}
