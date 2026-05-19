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
        'Claude in Chrome is unavailable in this source scaffold because @ant/claude-for-chrome-mcp is not published to the public npm registry.',
      )
    },
  }
}
