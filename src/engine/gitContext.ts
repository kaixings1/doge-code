/**
 * engine/gitContext.ts — Git 上下文感知（吸收自 Aider）
 *
 * 当 agent 编辑文件时，自动获取该文件的 git blame + 近期 commit 信息，
 * 注入对话帮助 agent 理解代码意图和变更历史。
 *
 * 来源项目：Aider (https://aider.chat) 的 --git-blame 机制
 */

export interface GitContextConfig {
  enabled: boolean
  /** 获取 blame 信息的命令（可选，默认不获取） */
  getBlame?: (filePath: string, cwd: string) => Promise<string>
  /** 获取近期 log 的命令（可选，默认不获取） */
  getLog?: (filePath: string, cwd: string, lines: number) => Promise<string>
  /** 是否获取 blame */
  includeBlame: boolean
  /** 是否获取 log */
  includeLog: boolean
  /** log 行数 */
  logLines: number
  /** 事件回调 */
  onEvent?: (event: GitContextEvent) => void
}

export type GitContextEvent =
  | { type: 'gitcontext_blame'; file: string; output: string }
  | { type: 'gitcontext_log'; file: string; output: string }
  | { type: 'gitcontext_inject'; file: string; context: string }
  | { type: 'gitcontext_skip'; reason: string }

export class GitContextInjector {
  private config: GitContextConfig

  constructor(config: GitContextConfig) {
    this.config = config
  }

  /**
   * 为编辑的文件获取 git 上下文。
   * 返回注入对话的消息列表。
   */
  async injectForFiles(files: string[], cwd: string): Promise<Array<{ role: 'user'; content: string }>> {
    if (!this.config.enabled || files.length === 0) return []

    const messages: Array<{ role: 'user'; content: string }> = []

    for (const file of files) {
      const parts: string[] = [`[Git Context for ${file}]`]
      let hasContext = false

      if (this.config.includeBlame) {
        try {
          const blame = await this.config.getBlame?.(file, cwd) ?? ''
          if (blame.trim()) {
            parts.push(`Recent changes (git blame):\n${blame}`)
            hasContext = true
            this.config.onEvent?.({ type: 'gitcontext_blame', file, output: blame })
          }
        } catch {
          // git blame 可能失败（非 git 仓库等）
        }
      }

      if (this.config.includeLog) {
        try {
          const log = await this.config.getLog?.(file, cwd, this.config.logLines) ?? ''
          if (log.trim()) {
            parts.push(`Recent commits (git log):\n${log}`)
            hasContext = true
            this.config.onEvent?.({ type: 'gitcontext_log', file, output: log })
          }
        } catch {
          // git log 可能失败
        }
      }

      if (hasContext) {
        parts.push('参考以上 git 历史信息来理解代码的修改意图。')
        messages.push({
          role: 'user',
          content: parts.join('\n\n'),
        })
        this.config.onEvent?.({ type: 'gitcontext_inject', file, context: parts.join('\n\n') })
      } else {
        this.config.onEvent?.({ type: 'gitcontext_skip', reason: 'no git history available' })
      }
    }

    return messages
  }

  /** 提取文件路径列表 */
  extractFiles(
    results: Array<{ toolUseId: string; success: boolean; output?: unknown }>,
  ): string[] {
    const files: string[] = []
    for (const r of results) {
      const output = typeof r.output === 'string' ? r.output : ''
      if (!r.success) continue

      // 匹配 "Edited file: xxx" 或 "File written to: xxx" 模式
      const editPattern = /(?:Edited|Wrote|Updated)\s+(?:file\s+)?[:\s]+([^\s,;]+\.(ts|tsx|js|jsx|py|rs|go|java|rb|php|c|cpp|h|css|scss|json|yaml|yml|md|txt|toml))/gi
      const matches = output.matchAll(editPattern)
      for (const m of matches) {
        if (!files.includes(m[1])) files.push(m[1])
      }
    }
    return files
  }
}
