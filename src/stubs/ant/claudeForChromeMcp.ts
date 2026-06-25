export type BrowserTool = {
  name: string
}

export type PermissionMode =
  | 'ask'
  | 'skip_all_permission_checks'
  | 'follow_a_plan'

export type Logger = {
  debug?: (message: string) => void
  info?: (message: string) => void
  warn?: (message: string) => void
  error?: (message: string) => void
}

export type ClaudeForChromeContext = {
  logger?: Logger
  [key: string]: unknown
}

export const BROWSER_TOOLS: BrowserTool[] = []

export function createClaudeForChromeMcpServer(
  _context: ClaudeForChromeContext,
): {
  connect: (_transport: unknown) => Promise<never>
} {
  return {
    async connect() {
      throw new Error(
        'Claude for Chrome 在此构建中不可用，因为 @ant/claude-for-chrome-mcp 未发布到公共 npm 注册表。',
      )
    },
  }
}
