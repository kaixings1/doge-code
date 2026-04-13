import reject from 'lodash-es/reject.js'
import { z } from 'zod/v4'
import { performMCPOAuthFlow } from '../../services/mcp/auth.js'
import {
  clearMcpAuthCache,
  reconnectMcpServerImpl,
} from '../../services/mcp/client.js'
import {
  buildMcpToolName,
  getMcpPrefix,
} from '../../services/mcp/mcpStringUtils.js'
import type {
  McpHTTPServerConfig,
  McpSSEServerConfig,
  ScopedMcpServerConfig,
} from '../../services/mcp/types.js'
import type { Tool } from '../../Tool.js'
import { errorMessage } from '../../utils/errors.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { logMCPDebug, logMCPError } from '../../utils/log.js'
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js'

const inputSchema = lazySchema(() => z.object({}))
type InputSchema = ReturnType<typeof inputSchema>

export type McpAuthOutput = {
  status: 'auth_url' | 'unsupported' | 'error'
  message: string
  authUrl?: string
}

function getConfigUrl(config: ScopedMcpServerConfig): string | undefined {
  if ('url' in config) return config.url
  return undefined
}

/**
 * Creates a pseudo-tool for an MCP server that is installed but not
 * authenticated. Surfaced in place of the server's real tools so the model
 * knows the server exists and can start the OAuth flow on the user's behalf.
 *
 * When called, starts performMCPOAuthFlow with skipBrowserOpen and returns
 * the authorization URL. The OAuth callback completes in the background;
 * once it fires, reconnectMcpServerImpl runs and the server's real tools
 * are swapped into appState.mcp.tools via the existing prefix-based
 * replacement (useManageMCPConnections.updateServer wipes anything matching
 * mcp__<server>__*, so this pseudo-tool is removed automatically).
 */
export function createMcpAuthTool(
  serverName: string,
  config: ScopedMcpServerConfig,
): Tool<InputSchema, McpAuthOutput> {
  const url = getConfigUrl(config)
  const transport = config.type ?? 'stdio'
  const location = url ? `${transport} at ${url}` : transport

  const description =
    `\`${serverName}\` MCP 服务器（${location}）已安装但需要认证。` +
    `调用此工具启动 OAuth 流程——您将收到一个授权 URL 分享给用户。` +
    `用户在浏览器中完成授权后，服务器的真实工具将自动可用。`

  return {
    name: buildMcpToolName(serverName, 'authenticate'),
    isMcp: true,
    mcpInfo: { serverName, toolName: 'authenticate' },
    isEnabled: () => true,
    isConcurrencySafe: () => false,
    isReadOnly: () => false,
    toAutoClassifierInput: () => serverName,
    userFacingName: () => `${serverName} - authenticate (MCP)`,
    maxResultSizeChars: 10_000,
    renderToolUseMessage: () => `Authenticate ${serverName} MCP server`,
    async description() {
      return description
    },
    async prompt() {
      return description
    },
    get inputSchema(): InputSchema {
      return inputSchema()
    },
    async checkPermissions(input): Promise<PermissionDecision> {
      return { behavior: 'allow', updatedInput: input }
    },
    async call(_input, context) {
      // claude.ai connectors use a separate auth flow (handleClaudeAIAuth in
      // MCPRemoteServerMenu) that we don't invoke programmatically here —
      // just point the user at /mcp.
      if (config.type === 'claudeai-proxy') {
        return {
          data: {
            status: 'unsupported' as const,
            message: `这是 claude.ai MCP 连接器。请用户运行 /mcp 并选择 "${serverName}" 进行认证。`,
          },
        }
      }

      // performMCPOAuthFlow only accepts sse/http. needs-auth state is only
      // set on HTTP 401 (UnauthorizedError) so other transports shouldn't
      // reach here, but be defensive.
      if (config.type !== 'sse' && config.type !== 'http') {
        return {
          data: {
            status: 'unsupported' as const,
            message: `服务器 "${serverName}" 使用 ${transport} 传输方式，不支持从此工具进行 OAuth。请用户运行 /mcp 手动认证。`,
          },
        }
      }

      const sseOrHttpConfig = config as (
        | McpSSEServerConfig
        | McpHTTPServerConfig
      ) & { scope: ScopedMcpServerConfig['scope'] }

      // Mirror cli/print.ts mcp_authenticate: start the flow, capture the
      // URL via onAuthorizationUrl, return it immediately. The flow's
      // Promise resolves later when the browser callback fires.
      let resolveAuthUrl: ((url: string) => void) | undefined
      const authUrlPromise = new Promise<string>(resolve => {
        resolveAuthUrl = resolve
      })

      const controller = new AbortController()
      const { setAppState } = context

      const oauthPromise = performMCPOAuthFlow(
        serverName,
        sseOrHttpConfig,
        u => resolveAuthUrl?.(u),
        controller.signal,
        { skipBrowserOpen: true },
      )

      // Background continuation: once OAuth completes, reconnect and swap
      // the real tools into appState. Prefix-based replacement removes this
      // pseudo-tool since it shares the mcp__<server>__ prefix.
      void oauthPromise
        .then(async () => {
          clearMcpAuthCache()
          const result = await reconnectMcpServerImpl(serverName, config)
          const prefix = getMcpPrefix(serverName)
          setAppState(prev => ({
            ...prev,
            mcp: {
              ...prev.mcp,
              clients: prev.mcp.clients.map(c =>
                c.name === serverName ? result.client : c,
              ),
              tools: [
                ...reject(prev.mcp.tools, t => t.name?.startsWith(prefix)),
                ...result.tools,
              ],
              commands: [
                ...reject(prev.mcp.commands, c => c.name?.startsWith(prefix)),
                ...result.commands,
              ],
              resources: result.resources
                ? { ...prev.mcp.resources, [serverName]: result.resources }
                : prev.mcp.resources,
            },
          }))
          logMCPDebug(
            serverName,
            `OAuth complete, reconnected with ${result.tools.length} tool(s)`,
          )
        })
        .catch(err => {
          logMCPError(
            serverName,
            `OAuth flow failed after tool-triggered start: ${errorMessage(err)}`,
          )
        })

      try {
        // Race: get the URL, or the flow completes without needing one
        // (e.g. XAA with cached IdP token — silent auth).
        const authUrl = await Promise.race([
          authUrlPromise,
          oauthPromise.then(() => null as string | null),
        ])

        if (authUrl) {
          return {
            data: {
              status: 'auth_url' as const,
              authUrl,
              message: `请用户在浏览器中打开此 URL 以授权 ${serverName} MCP 服务器：\n\n${authUrl}\n\n完成授权后，服务器工具将自动可用。`,
            },
          }
        }

        return {
          data: {
            status: 'auth_url' as const,
            message: `${serverName} 已静默完成认证。服务器工具现在应该可用。`,
          },
        }
      } catch (err) {
        return {
          data: {
            status: 'error' as const,
            message: `无法为 ${serverName} 启动 OAuth 流程：${errorMessage(err)}。请用户运行 /mcp 手动认证。`,
          },
        }
      }
    },
    mapToolResultToToolResultBlockParam(data, toolUseID) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: data.message,
      }
    },
  } satisfies Tool<InputSchema, McpAuthOutput>
}
