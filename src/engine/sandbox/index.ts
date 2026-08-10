/**
 * engine/sandbox/index.ts — 沙箱执行框架（吸收自 open-interpreter sandboxing）
 *
 * 提供可插拔的沙箱执行策略，保护系统免受工具执行的副作用影响。
 *
 * 来源项目：Open Interpreter codex-rs/sandboxing/src/manager.rs
 * 对应文件：sandboxing/src/manager.rs, windows-sandbox-rs/src/lib.rs
 *
 * 设计原则：
 * - 最小侵入：通过 ToolExecutor 包装器接入，不改变现有工具签名
 * - 平台适配：根据 process.platform 自动选择沙箱策略
 * - 可插拔：SandboxPolicy 接口允许自定义检查逻辑
 * - 默认安全：未配置沙箱时行为与之前完全一致
 */

import type { ToolExecutor } from "./toolScheduler.ts"

// ============ 类型定义 ============

export interface SandboxPolicy {
  /** 策略名称 */
  name: string
  /** 检查命令是否允许执行。返回 true 表示允许。 */
  allowCommand(toolName: string, input: Record<string, unknown>): boolean | Promise<boolean>
  /** 执行前的环境准备（如设置工作目录、环境变量） */
  prepare?(): void | Promise<void>
  /** 执行后的清理 */
  cleanup?(): void | Promise<void>
}

export interface SandboxConfig {
  /** 是否启用沙箱 */
  enabled: boolean
  /** 沙箱策略 */
  policy: SandboxPolicy
  /** 拒绝时的行为：'error' = 抛出错误, 'skip' = 跳过执行, 'warn' = 警告后执行 */
  onDeny: 'error' | 'skip' | 'warn'
}

// ============ 内置策略 ============

/**
 * NoOpSandboxPolicy — 无操作策略（默认）。
 *
 * 允许所有命令执行，不施加任何限制。
 * 用于未配置沙箱或显式禁用沙箱的场景。
 */
export class NoOpSandboxPolicy implements SandboxPolicy {
  name = 'noop'
  allowCommand(): boolean {
    return true
  }
}

/**
 * CommandAllowlistPolicy — 命令白名单策略。
 *
 * 仅允许指定工具执行命令，其他工具的命令被拒绝。
 * 适用于限制特定工具（如 Bash）的执行范围。
 */
export interface CommandAllowlistOptions {
  /** 允许执行命令的工具名称列表 */
  allowedTools: string[]
  /** 禁止执行的命令模式（正则表达式数组） */
  blockedPatterns?: RegExp[]
}

export class CommandAllowlistPolicy implements SandboxPolicy {
  name = 'command-allowlist'
  private allowedTools: Set<string>
  private blockedPatterns: RegExp[]

  constructor(opts: CommandAllowlistOptions) {
    this.allowedTools = new Set(opts.allowedTools)
    this.blockedPatterns = opts.blockedPatterns ?? [
      /rm\s+-rf\s+\//,           // 禁止根目录删除
      /sudo\s+/,                  // 禁止 sudo
      /chmod\s+777/,              // 禁止危险权限
      /curl\s+.*\|\s*sh/,         // 禁止管道执行远程脚本
      /wget\s+.*\|\s*(sh|bash)/,  // 同上
    ]
  }

  allowCommand(toolName: string, input: Record<string, unknown>): boolean {
    // 不在白名单中的工具直接拒绝
    if (!this.allowedTools.has(toolName)) {
      return false
    }

    // 检查是否匹配危险模式
    if (toolName === 'Bash' && typeof input.command === 'string') {
      for (const pattern of this.blockedPatterns) {
        if (pattern.test(input.command)) {
          return false
        }
      }
    }

    return true
  }
}

/**
 * WindowsRestrictedTokenPolicy — Windows 受限令牌策略（占位）。
 *
 * 对齐 open-interpreter windows-sandbox-rs 的 Restricted Token 模式：
 * - 移除管理员权限
 * - 限制网络访问（WFP）
 *
 * TODO: 完整实现需要调用 Windows API（CreateRestrictedToken / WFP）
 * 当前版本提供接口定义和基本的命令检查。
 */
export class WindowsRestrictedTokenPolicy implements SandboxPolicy {
  name = 'windows-restricted-token'
  private allowedTools: Set<string>

  constructor(allowedTools: string[] = ['Bash', 'Read', 'Edit', 'Write']) {
    this.allowedTools = new Set(allowedTools)
  }

  allowCommand(toolName: string, input: Record<string, unknown>): boolean {
    // 基础白名单检查
    if (!this.allowedTools.has(toolName)) {
      return false
    }

    // TODO: 添加 Windows 特定检查：
    // - 验证当前进程是否在受限令牌下运行
    // - 通过 WFP 检查网络访问权限
    // - 验证工作目录是否在允许范围内

    return true
  }

  prepare(): void {
    // TODO: 创建受限令牌
    // 参考 windows-sandbox-rs/src/lib.rs 的实现
  }

  cleanup(): void {
    // TODO: 清理受限令牌资源
  }
}

// ============ 沙箱执行器包装器 ============

/**
 * createSandboxedExecutor — 创建带沙箱检查的 ToolExecutor 包装器。
 *
 * 包装原始 executor，在执行前增加沙箱策略检查。
 * 不通过检查时根据 onDeny 配置处理。
 */
export function createSandboxedExecutor(
  executor: ToolExecutor,
  config: SandboxConfig,
): ToolExecutor {
  if (!config.enabled) {
    return executor
  }

  return {
    async execute(tool, input, options) {
      const allowed = await config.policy.allowCommand(tool.name, input)

      if (!allowed) {
        const reason = `沙箱策略 "${config.policy.name}" 拒绝了工具 "${tool.name}" 的执行请求`

        switch (config.onDeny) {
          case 'error':
            throw new Error(reason)
          case 'skip':
            return `[沙箱拦截] ${reason}`
          case 'warn':
            console.warn(`[沙箱警告] ${reason}`)
            // 警告后继续执行
            break
        }
      }

      // 准备阶段
      if (config.policy.prepare) {
        await config.policy.prepare()
      }

      try {
        // 执行原始逻辑
        return await executor.execute(tool, input, options)
      } finally {
        // 清理阶段
        if (config.policy.cleanup) {
          await config.policy.cleanup()
        }
      }
    },
  }
}

// ============ 平台默认沙箱 ============

/**
 * getDefaultSandboxPolicy — 根据平台返回默认沙箱策略。
 *
 * - Windows: CommandAllowlistPolicy（保守白名单）
 * - macOS/Linux: NoOpSandboxPolicy（后续可接入 bubblewrap/seatbelt）
 */
export function getDefaultSandboxPolicy(): SandboxPolicy {
  if (process.platform === 'win32') {
    return new WindowsRestrictedTokenPolicy()
  }
  return new NoOpSandboxPolicy()
}
