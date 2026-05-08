import { feature } from 'bun:bundle'
import type {
  Base64ImageSource,
  ContentBlockParam,
  MessageParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  SSEClientTransport,
  type SSEClientTransportOptions,
} from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import {
  StreamableHTTPClientTransport,
  type StreamableHTTPClientTransportOptions,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
  createFetchWithInit,
  type FetchLike,
  type Transport,
} from '@modelcontextprotocol/sdk/shared/transport.js'
import {
  CallToolResultSchema,
  ElicitRequestSchema,
  type ElicitRequestURLParams,
  type ElicitResult,
  ErrorCode,
  type JSONRPCMessage,
  type ListPromptsResult,
  ListPromptsResultSchema,
  ListResourcesResultSchema,
  ListRootsRequestSchema,
  type ListToolsResult,
  ListToolsResultSchema,
  McpError,
  type PromptMessage,
  type ResourceLink,
} from '@modelcontextprotocol/sdk/types.js'
import mapValues from 'lodash-es/mapValues.js'
import memoize from 'lodash-es/memoize.js'
import zipObject from 'lodash-es/zipObject.js'
import pMap from 'p-map'
import { getOriginalCwd, getSessionId } from '../../bootstrap/state.js'
import type { Command } from '../../commands.js'
import { getOauthConfig } from '../../constants/oauth.js'
import { PRODUCT_URL } from '../../constants/product.js'
import type { AppState } from '../../state/AppState.js'
import {
  type Tool,
  type ToolCallProgress,
  toolMatchesName,
} from '../../Tool.js'
import { ListMcpResourcesTool } from '../../tools/ListMcpResourcesTool/ListMcpResourcesTool.js'
import { type MCPProgress, MCPTool } from '../../tools/MCPTool/MCPTool.js'
import { createMcpAuthTool } from '../../tools/McpAuthTool/McpAuthTool.js'
import { ReadMcpResourceTool } from '../../tools/ReadMcpResourceTool/ReadMcpResourceTool.js'
import { createAbortController } from '../../utils/abortController.js'
import { count } from '../../utils/array.js'
import {
  checkAndRefreshOAuthTokenIfNeeded,
  getClaudeAIOAuthTokens,
  handleOAuth401Error,
} from '../../utils/auth.js'
import { registerCleanup } from '../../utils/cleanupRegistry.js'
import { detectCodeIndexingFromMcpServerName } from '../../utils/codeIndexing.js'
import { logForDebugging } from '../../utils/debug.js'
import { isEnvDefinedFalsy, isEnvTruthy } from '../../utils/envUtils.js'
import {
  errorMessage,
  TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
} from '../../utils/errors.js'
import { getMCPUserAgent } from '../../utils/http.js'
import { maybeNotifyIDEConnected } from '../../utils/ide.js'
import { maybeResizeAndDownsampleImageBuffer } from '../../utils/imageResizer.js'
import { logMCPDebug, logMCPError } from '../../utils/log.js'
import {
  getBinaryBlobSavedMessage,
  getFormatDescription,
  getLargeOutputInstructions,
  persistBinaryContent,
} from '../../utils/mcpOutputStorage.js'
import {
  getContentSizeEstimate,
  type MCPToolResult,
  mcpContentNeedsTruncation,
  truncateMcpContentIfNeeded,
} from '../../utils/mcpValidation.js'
import { WebSocketTransport } from '../../utils/mcpWebSocketTransport.js'
import { memoizeWithLRU } from '../../utils/memoize.js'
import { getWebSocketTLSOptions } from '../../utils/mtls.js'
import {
  getProxyFetchOptions,
  getWebSocketProxyAgent,
  getWebSocketProxyUrl,
} from '../../utils/proxy.js'
import { recursivelySanitizeUnicode } from '../../utils/sanitization.js'
import { getSessionIngressAuthToken } from '../../utils/sessionIngressAuth.js'
import { subprocessEnv } from '../../utils/subprocessEnv.js'
import {
  isPersistError,
  persistToolResult,
} from '../../utils/toolResultStorage.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../analytics/index.js'
import {
  type ElicitationWaitingState,
  runElicitationHooks,
  runElicitationResultHooks,
} from './elicitationHandler.js'
import { buildMcpToolName } from './mcpStringUtils.js'
import { normalizeNameForMCP } from './normalization.js'
import { getLoggingSafeMcpBaseUrl } from './utils.js'

 
const fetchMcpSkillsForClient = feature('MCP_SKILLS')
  ? (
      require('../../skills/mcpSkills.js') as typeof import('../../skills/mcpSkills.js')
    ).fetchMcpSkillsForClient
  : null

import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import type { AssistantMessage } from '../../types/message.js'
 
import { classifyMcpToolForCollapse } from '../../tools/MCPTool/classifyForCollapse.js'
import { clearKeychainCache } from '../../utils/secureStorage/macOsKeychainHelpers.js'
import { sleep } from '../../utils/sleep.js'
import {
  ClaudeAuthProvider,
  hasMcpDiscoveryButNoToken,
  wrapFetchWithStepUpDetection,
} from './auth.js'
import { markClaudeAiMcpConnected } from './claudeai.js'
import { getAllMcpConfigs, isMcpServerDisabled } from './config.js'
import { getMcpServerHeaders } from './headersHelper.js'
import { SdkControlClientTransport } from './SdkControlTransport.js'
import type {
  ConnectedMCPServer,
  MCPServerConnection,
  McpSdkServerConfig,
  ScopedMcpServerConfig,
  ServerResource,
} from './types.js'

/**
 * 自定义错误类，用于表示 MCP 工具调用因身份验证问题（例如过期的 OAuth 令牌返回 401）而失败。
 * 此错误应在工具执行层被捕获，以便将客户端状态更新为“需要身份验证”。
 */
export class McpAuthError extends Error {
  serverName: string
  constructor(serverName: string, message: string) {
    super(message)
    this.name = 'McpAuthError'
    this.serverName = serverName
  }
}

/**
 * 当 MCP 会话已过期且连接缓存已被清除时抛出。
 * 调用者应通过 ensureConnectedClient 获取一个新的客户端并重试。
 */
class McpSessionExpiredError extends Error {
  constructor(serverName: string) {
    super(`MCP 服务器 "${serverName}" 会话已过期`)
    this.name = 'McpSessionExpiredError'
  }
}

/**
 * 当 MCP 工具返回 `isError: true` 时抛出。携带结果的 `_meta` 属性，
 * 以便 SDK 消费者仍能接收到它 —— 根据 MCP 规范，`_meta` 在基础 Result 类型上有效，并且错误结果也包含它。
 */
export class McpToolCallError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS extends TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS {
  constructor(
    message: string,
    telemetryMessage: string,
    readonly mcpMeta?: { _meta?: Record<string, unknown> },
  ) {
    super(message, telemetryMessage)
    this.name = 'McpToolCallError'
  }
}

/**
 * 检测错误是否为 MCP “未找到会话”错误（HTTP 404 + JSON-RPC 代码 -32001）。
 * 根据 MCP 规范，当会话 ID 不再有效时，服务器会返回 404。
 * 我们同时检查两个信号，以避免与通用 404（URL 错误、服务器不存在等）混淆。
 */
export function isMcpSessionExpiredError(error: Error): boolean {
  const httpStatus =
    'code' in error ? (error as Error & { code?: number }).code : undefined
  if (httpStatus !== 404) {
    return false
  }
  // SDK 将响应体文本嵌入到错误消息中。
  // MCP 服务器返回：{"error":{"code":-32001,"message":"Session not found"},...}
  // 检查 JSON-RPC 错误代码以区别于通用 Web 服务器 404。
  return (
    error.message.includes('"code":-32001') ||
    error.message.includes('"code": -32001')
  )
}

/**
 * MCP 工具调用的默认超时时间（实际为无限 - 约 27.8 小时）。
 */
const DEFAULT_MCP_TOOL_TIMEOUT_MS = 100_000_000

/**
 * 发送给模型的 MCP 工具描述和服务器指令的最大字符数。
 * 观察到基于 OpenAPI 生成的 MCP 服务器会将 15-60KB 的端点文档
 * 转储到 tool.description 中；此上限可截断尾部 95% 的内容而不丢失意图。
 */
const MAX_MCP_DESCRIPTION_LENGTH = 2048

/**
 * 获取 MCP 工具调用的超时时间（以毫秒为单位）。
 * 如果设置了 MCP_TOOL_TIMEOUT 环境变量则使用其值，否则默认为约 27.8 小时。
 */
function getMcpToolTimeoutMs(): number {
  return (
    parseInt(process.env.MCP_TOOL_TIMEOUT || '', 10) ||
    DEFAULT_MCP_TOOL_TIMEOUT_MS
  )
}

import { isClaudeInChromeMCPServer } from '../../utils/claudeInChrome/common.js'

// 懒加载：toolRendering.tsx 引用了 React/ink；仅当连接了 Claude-in-Chrome MCP 服务器时才需要
 
const claudeInChromeToolRendering =
  (): typeof import('../../utils/claudeInChrome/toolRendering.js') =>
    require('../../utils/claudeInChrome/toolRendering.js')
// 懒加载：wrapper.tsx → hostAdapter.ts → executor.ts 引用了原生模块
// （@ant/computer-use-input + @ant/computer-use-swift）。由 GrowthBook tengu_malort_pedway 在运行时控制（参见 gates.ts）。
const computerUseWrapper = feature('CHICAGO_MCP')
  ? (): typeof import('../../utils/computerUse/wrapper.js') =>
      require('../../utils/computerUse/wrapper.js')
  : undefined
const isComputerUseMCPServer = feature('CHICAGO_MCP')
  ? (
      require('../../utils/computerUse/common.js') as typeof import('../../utils/computerUse/common.js')
    ).isComputerUseMCPServer
  : undefined

import { mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
 
import { jsonParse, jsonStringify } from '../../utils/slowOperations.js'

const MCP_AUTH_CACHE_TTL_MS = 15 * 60 * 1000 // 15 分钟

type McpAuthCacheData = Record<string, { timestamp: number }>

function getMcpAuthCachePath(): string {
  return join(getClaudeConfigHomeDir(), 'mcp-needs-auth-cache.json')
}

// 使用 memoization，使得批处理连接期间 N 个并发的 isMcpAuthCached() 调用
// 共享单个文件读取，而不是对同一文件进行 N 次读取。写入（setMcpAuthCacheEntry）
// 和清除（clearMcpAuthCache）时会使缓存失效。未使用 lodash memoize，
// 因为我们需要将缓存置空，而不是按键删除。
let authCachePromise: Promise<McpAuthCacheData> | null = null

function getMcpAuthCache(): Promise<McpAuthCacheData> {
  if (!authCachePromise) {
    authCachePromise = readFile(getMcpAuthCachePath(), 'utf-8')
      .then(data => jsonParse(data) as McpAuthCacheData)
      .catch(() => ({}))
  }
  return authCachePromise
}

async function isMcpAuthCached(serverId: string): Promise<boolean> {
  const cache = await getMcpAuthCache()
  const entry = cache[serverId]
  if (!entry) {
    return false
  }
  return Date.now() - entry.timestamp < MCP_AUTH_CACHE_TTL_MS
}

// 通过 Promise 链序列化缓存写入，以防止多个服务器在同一批次返回 401 时
// 出现并发读取-修改-写入的竞态条件。
let writeChain = Promise.resolve()

function setMcpAuthCacheEntry(serverId: string): void {
  writeChain = writeChain
    .then(async () => {
      const cache = await getMcpAuthCache()
      cache[serverId] = { timestamp: Date.now() }
      const cachePath = getMcpAuthCachePath()
      await mkdir(dirname(cachePath), { recursive: true })
      await writeFile(cachePath, jsonStringify(cache))
      // 使读取缓存失效，以便后续读取能看到新条目。
      // 这是安全的，因为 writeChain 序列化了写入：下一个写入的
      // getMcpAuthCache() 调用将重新读取包含此条目的文件。
      authCachePromise = null
    })
    .catch(() => {
      // 尽最大努力写入缓存
    })
}

export function clearMcpAuthCache(): void {
  authCachePromise = null
  void unlink(getMcpAuthCachePath()).catch(() => {
    // 缓存文件可能不存在
  })
}

/**
 * 用于展开的分析字段，表示服务器的基本 URL。调用 getLoggingSafeMcpBaseUrl
 * 一次（而不是它替换的内联三元表达式调用两次）。类型为 AnalyticsMetadata，
 * 因为 URL 已剥离查询参数且可以安全记录。
 */
function mcpBaseUrlAnalytics(serverRef: ScopedMcpServerConfig): {
  mcpServerBaseUrl?: AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
} {
  const url = getLoggingSafeMcpBaseUrl(serverRef)
  return url
    ? {
        mcpServerBaseUrl:
          url as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      }
    : {}
}

/**
 * 针对 sse/http/claudeai-proxy 连接期间身份验证失败的共享处理程序：
 * 发送 tengu_mcp_server_needs_auth 事件，缓存需要身份验证的条目，并返回
 * 需要身份验证的连接结果。
 */
function handleRemoteAuthFailure(
  name: string,
  serverRef: ScopedMcpServerConfig,
  transportType: 'sse' | 'http' | 'claudeai-proxy',
): MCPServerConnection {
  logEvent('tengu_mcp_server_needs_auth', {
    transportType:
      transportType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    ...mcpBaseUrlAnalytics(serverRef),
  })
  const label: Record<typeof transportType, string> = {
    sse: 'SSE',
    http: 'HTTP',
    'claudeai-proxy': 'claude.ai 代理',
  }
  logMCPDebug(
    name,
    `${label[transportType]} 服务器需要身份验证`,
  )
  setMcpAuthCacheEntry(name)
  return { name, type: 'needs-auth', config: serverRef }
}

/**
 * 用于 claude.ai 代理连接的 fetch 包装器。附加 OAuth 不记名令牌，
 * 并在遇到 401 时通过 handleOAuth401Error 重试一次（强制刷新）。
 *
 * Anthropic API 路径具有此重试功能（withRetry.ts，grove.ts）以处理
 * memoize 缓存陈旧和时钟漂移。如果没有此功能，单个过期的令牌
 * 将对每个 claude.ai 连接器返回 401，并将它们全部放入 15 分钟的需要身份验证缓存中。
 */
export function createClaudeAiProxyFetch(innerFetch: FetchLike): FetchLike {
  return async (url, init) => {
    const doRequest = async () => {
      await checkAndRefreshOAuthTokenIfNeeded()
      const currentTokens = getClaudeAIOAuthTokens()
      if (!currentTokens) {
        throw new Error('没有可用的 claude.ai OAuth 令牌')
      }
      // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
      const headers = new Headers(init?.headers)
      headers.set('Authorization', `Bearer ${currentTokens.accessToken}`)
      const response = await innerFetch(url, { ...init, headers })
      // 返回发送的确切令牌。在并发 401 情况下，请求后再次读取 getClaudeAIOAuthTokens()
      // 是错误的：另一个连接器的 handleOAuth401Error 清除了 memoize 缓存，因此我们会从钥匙串中读取
      // 新的令牌，将其传递给 handleOAuth401Error，后者发现与钥匙串中的相同 → 返回 false → 跳过重试。
      // 与 bridgeApi.ts 中的 withOAuthRetry 模式相同（令牌作为函数参数传递）。
      return { response, sentToken: currentTokens.accessToken }
    }

    const { response, sentToken } = await doRequest()
    if (response.status !== 401) {
      return response
    }
    // 仅当令牌实际更改（钥匙串中有更新的令牌，或强制刷新成功）时，handleOAuth401Error 才返回 true。
    // 仅在此条件下进行重试——否则，对于每个其下游服务确实需要身份验证的连接器（常见情况：30 多个服务器
    // 带有“MCP 服务器需要身份验证但未配置 OAuth 令牌”），我们将双倍往返时间。
    const tokenChanged = await handleOAuth401Error(sentToken).catch(() => false)
    logEvent('tengu_mcp_claudeai_proxy_401', {
      tokenChanged:
        tokenChanged as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    if (!tokenChanged) {
      // ELOCKED 争用：另一个连接器可能已赢得锁文件并刷新了——检查令牌是否在我们下方更改了
      const now = getClaudeAIOAuthTokens()?.accessToken
      if (!now || now === sentToken) {
        return response
      }
    }
    try {
      return (await doRequest()).response
    } catch {
      // 重试本身失败（网络错误）。返回原始 401，以便外部处理程序可以对其进行分类。
      return response
    }
  }
}

// 传递给 mcpWebSocketTransport 的 WebSocket 实例的最小接口
type WsClientLike = {
  readonly readyState: number
  close(): void
  send(data: string): void
}

/**
 * 使用 MCP 协议创建 ws.WebSocket 客户端。
 * Bun 的 ws shim 类型缺少真实 ws 包支持的 3 参数构造函数（url, protocols, options），
 * 因此我们在此处强制转换构造函数。
 */
async function createNodeWsClient(
  url: string,
  options: Record<string, unknown>,
): Promise<WsClientLike> {
  const wsModule = await import('ws')
  const WS = wsModule.default as unknown as new (
    url: string,
    protocols: string[],
    options: Record<string, unknown>,
  ) => WsClientLike
  return new WS(url, ['mcp'], options)
}

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])

function getConnectionTimeoutMs(): number {
  return parseInt(process.env.MCP_TIMEOUT || '', 10) || 30000
}

/**
 * 单个 MCP 请求（身份验证、工具调用等）的默认超时时间
 */
const MCP_REQUEST_TIMEOUT_MS = 60000

/**
 * MCP 流式 HTTP 规范要求客户端在每个 POST 请求上声明接受 JSON 和 SSE。
 * 严格执行此规范的服务器会拒绝没有此声明的请求（HTTP 406）。
 * https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#sending-messages-to-the-server
 */
const MCP_STREAMABLE_HTTP_ACCEPT = 'application/json, text/event-stream'

/**
 * 包装 fetch 函数，为每个请求应用一个新的超时信号。
 * 这避免了在连接时创建的单个 AbortSignal.timeout() 在 60 秒后变得陈旧，
 * 导致所有后续请求立即失败并显示“操作超时。”的问题。使用 60 秒超时。
 *
 * 同时确保 POST 请求上存在 MCP 流式 HTTP 规范要求的 Accept 标头。
 * MCP SDK 在 StreamableHTTPClientTransport.send() 内部设置此标头，
 * 但它附加到一个 Headers 实例上，该实例在此处通过对象展开传递，
 * 并且观察到某些运行时/代理在到达网络之前会丢弃它。
 * 参见 https://github.com/anthropics/claude-agent-sdk-typescript/issues/202。
 * 在此处规范化（fetch() 之前的最后一个包装器）可保证它被发送。
 *
 * GET 请求被排除在超时之外，因为对于 MCP 传输，它们是打算无限期保持打开的长期 SSE 流。
 * （身份验证相关的 GET 在 auth.ts 中使用单独的 fetch 包装器，并带有自己的超时。）
 *
 * @param baseFetch - 要包装的 fetch 函数
 */
export function wrapFetchWithTimeout(baseFetch: FetchLike): FetchLike {
  return async (url: string | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()

    // 跳过 GET 请求的超时 —— 在 MCP 传输中，这些是长期 SSE 流。
    // （auth.ts 中的 OAuth 发现 GET 使用单独的 createAuthFetch()，并带有自己的超时。）
    if (method === 'GET') {
      return baseFetch(url, init)
    }

    // 规范化标头并保证 Streamable-HTTP Accept 值。new Headers()
    // 接受 HeadersInit | undefined，并从普通对象、元组数组和现有 Headers 实例复制 ——
    // 因此无论 SDK 传递给我们什么形状，Accept 值都会在下面作为具体对象的自有属性保留在展开中。
    // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
    const headers = new Headers(init?.headers)
    if (!headers.has('accept')) {
      headers.set('accept', MCP_STREAMABLE_HTTP_ACCEPT)
    }

    // 使用 setTimeout 而不是 AbortSignal.timeout()，以便我们可以在完成时 clearTimeout。
    // AbortSignal.timeout 的内部计时器仅在信号被垃圾回收时释放，而在 Bun 中是惰性的 ——
    // 即使请求在几毫秒内完成，每个请求也会在完整 60 秒内保留约 2.4KB 的本机内存。
    const controller = new AbortController()
    const timer = setTimeout(
      c =>
        c.abort(new DOMException('操作超时。', 'TimeoutError')),
      MCP_REQUEST_TIMEOUT_MS,
      controller,
    )
    timer.unref?.()

    const parentSignal = init?.signal
    const abort = () => controller.abort(parentSignal?.reason)
    parentSignal?.addEventListener('abort', abort)
    if (parentSignal?.aborted) {
      controller.abort(parentSignal.reason)
    }

    const cleanup = () => {
      clearTimeout(timer)
      parentSignal?.removeEventListener('abort', abort)
    }

    try {
      const response = await baseFetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      })
      cleanup()
      return response
    } catch (error) {
      cleanup()
      throw error
    }
  }
}

export function getMcpServerConnectionBatchSize(): number {
  return parseInt(process.env.MCP_SERVER_CONNECTION_BATCH_SIZE || '', 10) || 3
}

function getRemoteMcpServerConnectionBatchSize(): number {
  return (
    parseInt(process.env.MCP_REMOTE_SERVER_CONNECTION_BATCH_SIZE || '', 10) ||
    20
  )
}

function isLocalMcpServer(config: ScopedMcpServerConfig): boolean {
  return !config.type || config.type === 'stdio' || config.type === 'sdk'
}

// 对于 IDE MCP 服务器，我们只包含特定的工具
const ALLOWED_IDE_TOOLS = ['mcp__ide__executeCode', 'mcp__ide__getDiagnostics']
function isIncludedMcpTool(tool: Tool): boolean {
  return (
    !tool.name.startsWith('mcp__ide__') || ALLOWED_IDE_TOOLS.includes(tool.name)
  )
}

/**
 * 生成服务器连接的缓存键
 * @param name 服务器名称
 * @param serverRef 服务器配置
 * @returns 缓存键字符串
 */
export function getServerCacheKey(
  name: string,
  serverRef: ScopedMcpServerConfig,
): string {
  return `${name}-${jsonStringify(serverRef)}`
}

/**
 * TODO (ollie)：这里的记忆化增加了大量复杂性，我不确定它是否真的提高了性能
 * 尝试连接到单个 MCP 服务器
 * @param name 服务器名称
 * @param serverRef 作用域服务器配置
 * @returns 包装后的客户端（已连接或失败）
 */
export const connectToServer = memoize(
  async (
    name: string,
    serverRef: ScopedMcpServerConfig,
    serverStats?: {
      totalServers: number
      stdioCount: number
      sseCount: number
      httpCount: number
      sseIdeCount: number
      wsIdeCount: number
    },
  ): Promise<MCPServerConnection> => {
    const connectStartTime = Date.now()
    let inProcessServer:
      | { connect(t: Transport): Promise<void>; close(): Promise<void> }
      | undefined
    try {
      let transport

      // 如果我们有会话入口 JWT，我们将通过会话入口连接，
      // 而不是直接连接到远程 MCP。
      const sessionIngressToken = getSessionIngressAuthToken()

      if (serverRef.type === 'sse') {
        // 为此服务器创建身份验证提供程序
        const authProvider = new ClaudeAuthProvider(name, serverRef)

        // 获取合并后的标头（静态 + 动态）
        const combinedHeaders = await getMcpServerHeaders(name, serverRef)

        // 在 SSEClientTransport 中使用身份验证提供程序
        const transportOptions: SSEClientTransportOptions = {
          authProvider,
          // 每个请求使用新的超时，以避免陈旧的 AbortSignal 错误。
          // 阶梯升级检测包装在最内层，以便在 SDK 的处理程序调用 auth() → tokens() 之前看到 403。
          fetch: wrapFetchWithTimeout(
            wrapFetchWithStepUpDetection(createFetchWithInit(), authProvider),
          ),
          requestInit: {
            headers: {
              'User-Agent': getMCPUserAgent(),
              ...combinedHeaders,
            },
          },
        }

        // 重要提示：始终使用不使用超时包装器的 fetch 来设置 eventSourceInit。
        // EventSource 连接是长期的（无限期保持打开以接收服务器发送的事件），
        // 因此应用 60 秒超时会终止它。超时仅用于单个 API 请求（POST、身份验证刷新），
        // 而不是持久的 SSE 流。
        transportOptions.eventSourceInit = {
          fetch: async (url: string | URL, init?: RequestInit) => {
            // 从身份验证提供程序获取身份验证标头
            const authHeaders: Record<string, string> = {}
            const tokens = await authProvider.tokens()
            if (tokens) {
              authHeaders.Authorization = `Bearer ${tokens.access_token}`
            }

            const proxyOptions = getProxyFetchOptions()
            // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
            return fetch(url, {
              ...init,
              ...proxyOptions,
              headers: {
                'User-Agent': getMCPUserAgent(),
                ...authHeaders,
                ...init?.headers,
                ...combinedHeaders,
                Accept: 'text/event-stream',
              },
            })
          },
        }

        transport = new SSEClientTransport(
          new URL(serverRef.url),
          transportOptions,
        )
        logMCPDebug(name, `SSE 传输已初始化，等待连接`)
      } else if (serverRef.type === 'sse-ide') {
        logMCPDebug(name, `正在设置到 ${serverRef.url} 的 SSE-IDE 传输`)
        // IDE 服务器不需要身份验证
        // TODO：使用 lockfile 中提供的身份验证令牌
        const proxyOptions = getProxyFetchOptions()
        const transportOptions: SSEClientTransportOptions =
          proxyOptions.dispatcher
            ? {
                eventSourceInit: {
                  fetch: async (url: string | URL, init?: RequestInit) => {
                    // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
                    return fetch(url, {
                      ...init,
                      ...proxyOptions,
                      headers: {
                        'User-Agent': getMCPUserAgent(),
                        ...init?.headers,
                      },
                    })
                  },
                },
              }
            : {}

        transport = new SSEClientTransport(
          new URL(serverRef.url),
          Object.keys(transportOptions).length > 0
            ? transportOptions
            : undefined,
        )
      } else if (serverRef.type === 'ws-ide') {
        const tlsOptions = getWebSocketTLSOptions()
        const wsHeaders = {
          'User-Agent': getMCPUserAgent(),
          ...(serverRef.authToken && {
            'X-Claude-Code-Ide-Authorization': serverRef.authToken,
          }),
        }

        let wsClient: WsClientLike
        if (typeof Bun !== 'undefined') {
          // Bun 的 WebSocket 支持标头/代理/tls 选项，但 DOM 类型不支持
          // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
          wsClient = new globalThis.WebSocket(serverRef.url, {
            protocols: ['mcp'],
            headers: wsHeaders,
            proxy: getWebSocketProxyUrl(serverRef.url),
            tls: tlsOptions || undefined,
          } as unknown as string[])
        } else {
          wsClient = await createNodeWsClient(serverRef.url, {
            headers: wsHeaders,
            agent: getWebSocketProxyAgent(serverRef.url),
            ...(tlsOptions || {}),
          })
        }
        transport = new WebSocketTransport(wsClient)
      } else if (serverRef.type === 'ws') {
        logMCPDebug(
          name,
          `正在初始化到 ${serverRef.url} 的 WebSocket 传输`,
        )

        const combinedHeaders = await getMcpServerHeaders(name, serverRef)

        const tlsOptions = getWebSocketTLSOptions()
        const wsHeaders = {
          'User-Agent': getMCPUserAgent(),
          ...(sessionIngressToken && {
            Authorization: `Bearer ${sessionIngressToken}`,
          }),
          ...combinedHeaders,
        }

        // 在记录之前隐藏敏感标头
        const wsHeadersForLogging = mapValues(wsHeaders, (value, key) =>
          key.toLowerCase() === 'authorization' ? '[已隐藏]' : value,
        )

        logMCPDebug(
          name,
          `WebSocket 传输选项：${jsonStringify({
            url: serverRef.url,
            headers: wsHeadersForLogging,
            hasSessionAuth: !!sessionIngressToken,
          })}`,
        )

        let wsClient: WsClientLike
        if (typeof Bun !== 'undefined') {
          // Bun 的 WebSocket 支持标头/代理/tls 选项，但 DOM 类型不支持
          // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
          wsClient = new globalThis.WebSocket(serverRef.url, {
            protocols: ['mcp'],
            headers: wsHeaders,
            proxy: getWebSocketProxyUrl(serverRef.url),
            tls: tlsOptions || undefined,
          } as unknown as string[])
        } else {
          wsClient = await createNodeWsClient(serverRef.url, {
            headers: wsHeaders,
            agent: getWebSocketProxyAgent(serverRef.url),
            ...(tlsOptions || {}),
          })
        }
        transport = new WebSocketTransport(wsClient)
      } else if (serverRef.type === 'http') {
        logMCPDebug(name, `正在初始化到 ${serverRef.url} 的 HTTP 传输`)
        logMCPDebug(
          name,
          `Node 版本：${process.version}，平台：${process.platform}`,
        )
        logMCPDebug(
          name,
          `环境：${jsonStringify({
            NODE_OPTIONS: process.env.NODE_OPTIONS || '未设置',
            UV_THREADPOOL_SIZE: process.env.UV_THREADPOOL_SIZE || '默认',
            HTTP_PROXY: process.env.HTTP_PROXY || '未设置',
            HTTPS_PROXY: process.env.HTTPS_PROXY || '未设置',
            NO_PROXY: process.env.NO_PROXY || '未设置',
          })}`,
        )

        // 为此服务器创建身份验证提供程序
        const authProvider = new ClaudeAuthProvider(name, serverRef)

        // 获取合并后的标头（静态 + 动态）
        const combinedHeaders = await getMcpServerHeaders(name, serverRef)

        // 检查此服务器是否存储了 OAuth 令牌。如果有，SDK 的
        // authProvider 将设置 Authorization —— 不要用会话入口令牌覆盖
        // （SDK 在 authProvider 之后合并 requestInit）。CCR 代理 URL（ccr_shttp_mcp）
        // 没有存储的 OAuth，因此它们仍然获得入口令牌。参见 PR #24454 讨论。
        const hasOAuthTokens = !!(await authProvider.tokens())

        // 在 StreamableHTTPClientTransport 中使用身份验证提供程序
        const proxyOptions = getProxyFetchOptions()
        logMCPDebug(
          name,
          `代理选项：${proxyOptions.dispatcher ? '自定义调度程序' : '默认'}`,
        )

        const transportOptions: StreamableHTTPClientTransportOptions = {
          authProvider,
          // 每个请求使用新的超时，以避免陈旧的 AbortSignal 错误。
          // 阶梯升级检测包装在最内层，以便在 SDK 的处理程序调用 auth() → tokens() 之前看到 403。
          fetch: wrapFetchWithTimeout(
            wrapFetchWithStepUpDetection(createFetchWithInit(), authProvider),
          ),
          requestInit: {
            ...proxyOptions,
            headers: {
              'User-Agent': getMCPUserAgent(),
              ...(sessionIngressToken &&
                !hasOAuthTokens && {
                  Authorization: `Bearer ${sessionIngressToken}`,
                }),
              ...combinedHeaders,
            },
          },
        }

        // 在记录之前隐藏敏感标头
        const headersForLogging = transportOptions.requestInit?.headers
          ? mapValues(
              transportOptions.requestInit.headers as Record<string, string>,
              (value, key) =>
                key.toLowerCase() === 'authorization' ? '[已隐藏]' : value,
            )
          : undefined

        logMCPDebug(
          name,
          `HTTP 传输选项：${jsonStringify({
            url: serverRef.url,
            headers: headersForLogging,
            hasAuthProvider: !!authProvider,
            timeoutMs: MCP_REQUEST_TIMEOUT_MS,
          })}`,
        )

        transport = new StreamableHTTPClientTransport(
          new URL(serverRef.url),
          transportOptions,
        )
        logMCPDebug(name, `HTTP 传输创建成功`)
      } else if (serverRef.type === 'sdk') {
        throw new Error('SDK 服务器应在 print.ts 中处理')
      } else if (serverRef.type === 'claudeai-proxy') {
        logMCPDebug(
          name,
          `正在为服务器 ${serverRef.id} 初始化 claude.ai 代理传输`,
        )

        const tokens = getClaudeAIOAuthTokens()
        if (!tokens) {
          throw new Error('未找到 claude.ai OAuth 令牌')
        }

        const oauthConfig = getOauthConfig()
        const proxyUrl = `${oauthConfig.MCP_PROXY_URL}${oauthConfig.MCP_PROXY_PATH.replace('{server_id}', serverRef.id)}`

        logMCPDebug(name, `正在使用 claude.ai 代理，地址为 ${proxyUrl}`)

        // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
        const fetchWithAuth = createClaudeAiProxyFetch(globalThis.fetch)

        const proxyOptions = getProxyFetchOptions()
        const transportOptions: StreamableHTTPClientTransportOptions = {
          // 用新的超时包装 fetchWithAuth，应用于每个请求
          fetch: wrapFetchWithTimeout(fetchWithAuth),
          requestInit: {
            ...proxyOptions,
            headers: {
              'User-Agent': getMCPUserAgent(),
              'X-Mcp-Client-Session-Id': getSessionId(),
            },
          },
        }

        transport = new StreamableHTTPClientTransport(
          new URL(proxyUrl),
          transportOptions,
        )
        logMCPDebug(name, `claude.ai 代理传输创建成功`)
      } else if (
        (serverRef.type === 'stdio' || !serverRef.type) &&
        isClaudeInChromeMCPServer(name)
      ) {
        // 在进程内运行 Chrome MCP 服务器，避免生成约 325 MB 的子进程
        const { createChromeContext } = await import(
          '../../utils/claudeInChrome/mcpServer.js'
        )
        const { createClaudeForChromeMcpServer } = await import(
          '@ant/claude-for-chrome-mcp'
        )
        const { createLinkedTransportPair } = await import(
          './InProcessTransport.js'
        )
        const context = createChromeContext(serverRef.env)
        inProcessServer = createClaudeForChromeMcpServer(context)
        const [clientTransport, serverTransport] = createLinkedTransportPair()
        await inProcessServer.connect(serverTransport)
        transport = clientTransport
        logMCPDebug(name, `进程内 Chrome MCP 服务器已启动`)
      } else if (
        feature('CHICAGO_MCP') &&
        (serverRef.type === 'stdio' || !serverRef.type) &&
        isComputerUseMCPServer!(name)
      ) {
        // 在进程内运行 Computer Use MCP 服务器 —— 与上述 Chrome 同理。
        // 该包的 CallTool 处理程序是一个存根；实际调度通过 wrapper.tsx 的 .call() 覆盖进行。
        const { createComputerUseMcpServerForCli } = await import(
          '../../utils/computerUse/mcpServer.js'
        )
        const { createLinkedTransportPair } = await import(
          './InProcessTransport.js'
        )
        inProcessServer = await createComputerUseMcpServerForCli()
        const [clientTransport, serverTransport] = createLinkedTransportPair()
        await inProcessServer.connect(serverTransport)
        transport = clientTransport
        logMCPDebug(name, `进程内 Computer Use MCP 服务器已启动`)
      } else if (serverRef.type === 'stdio' || !serverRef.type) {
        const finalCommand =
          process.env.CLAUDE_CODE_SHELL_PREFIX || serverRef.command
        const finalArgs = process.env.CLAUDE_CODE_SHELL_PREFIX
          ? [[serverRef.command, ...serverRef.args].join(' ')]
          : serverRef.args
        transport = new StdioClientTransport({
          command: finalCommand,
          args: finalArgs,
          env: {
            ...subprocessEnv(),
            ...serverRef.env,
          } as Record<string, string>,
          stderr: 'pipe', // 防止 MCP 服务器的错误输出打印到 UI
        })
      } else {
        throw new Error(`不支持的服务器类型：${serverRef.type}`)
      }

      // 在连接之前为 stdio 传输设置 stderr 日志记录，以防在连接启动期间发出任何 stderr
      // 输出（这对于调试失败的连接可能很有用）。
      // 存储处理程序引用以便清理，防止内存泄漏
      let stderrHandler: ((data: Buffer) => void) | undefined
      let stderrOutput = ''
      if (serverRef.type === 'stdio' || !serverRef.type) {
        const stdioTransport = transport as StdioClientTransport
        if (stdioTransport.stderr) {
          stderrHandler = (data: Buffer) => {
            // 限制 stderr 累积以防止内存无限制增长
            if (stderrOutput.length < 64 * 1024 * 1024) {
              try {
                stderrOutput += data.toString()
              } catch {
                // 忽略超出最大字符串长度的错误
              }
            }
          }
          stdioTransport.stderr.on('data', stderrHandler)
        }
      }

      const client = new Client(
        {
          name: 'claude-code',
          title: 'Claude Code',
          version: MACRO.VERSION ?? 'unknown',
          description: "Anthropic 的智能编程工具",
          websiteUrl: PRODUCT_URL,
        },
        {
          capabilities: {
            roots: {},
            // 空对象声明能力。发送 {form:{},url:{}} 会破坏 Java MCP SDK 服务器（Spring AI），
            // 其 Elicitation 类没有字段，遇到未知属性会失败。
            elicitation: {},
          },
        },
      )

      // 如果可用，添加客户端事件的调试日志
      if (serverRef.type === 'http') {
        logMCPDebug(name, `客户端已创建，正在设置请求处理程序`)
      }

      client.setRequestHandler(ListRootsRequestSchema, async () => {
        logMCPDebug(name, `从服务器接收到 ListRoots 请求`)
        return {
          roots: [
            {
              uri: `file://${getOriginalCwd()}`,
            },
          ],
        }
      })

      // 为连接尝试添加超时，以防止测试无限挂起
      logMCPDebug(
        name,
        `开始连接，超时时间为 ${getConnectionTimeoutMs()}ms`,
      )

      // 对于 HTTP 传输，首先尝试基本的连接性测试
      if (serverRef.type === 'http') {
        logMCPDebug(name, `正在测试到 ${serverRef.url} 的基本 HTTP 连接性`)
        try {
          const testUrl = new URL(serverRef.url)
          logMCPDebug(
            name,
            `解析后的 URL：host=${testUrl.hostname}, port=${testUrl.port || '默认'}, protocol=${testUrl.protocol}`,
          )

          // 记录 DNS 解析尝试
          if (
            testUrl.hostname === '127.0.0.1' ||
            testUrl.hostname === 'localhost'
          ) {
            logMCPDebug(name, `正在使用环回地址：${testUrl.hostname}`)
          }
        } catch (urlError) {
          logMCPDebug(name, `解析 URL 失败：${urlError}`)
        }
      }

      const connectPromise = client.connect(transport)
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          const elapsed = Date.now() - connectStartTime
          logMCPDebug(
            name,
            `连接超时在 ${elapsed}ms 后触发（限制：${getConnectionTimeoutMs()}ms）`,
          )
          if (inProcessServer) {
            inProcessServer.close().catch(() => {})
          }
          transport.close().catch(() => {})
          reject(
            new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
              `MCP 服务器 "${name}" 连接超时，经过 ${getConnectionTimeoutMs()}ms`,
              'MCP 连接超时',
            ),
          )
        }, getConnectionTimeoutMs())

        // 如果 connect 解决或拒绝，清理超时
        connectPromise.then(
          () => {
            clearTimeout(timeoutId)
          },
          _error => {
            clearTimeout(timeoutId)
          },
        )
      })

      try {
        await Promise.race([connectPromise, timeoutPromise])
        if (stderrOutput) {
          logMCPError(name, `服务器 stderr：${stderrOutput}`)
          stderrOutput = '' // 释放累积的字符串以防止内存增长
        }
        const elapsed = Date.now() - connectStartTime
        logMCPDebug(
          name,
          `成功连接（传输方式：${serverRef.type || 'stdio'}），耗时 ${elapsed}ms`,
        )
      } catch (error) {
        const elapsed = Date.now() - connectStartTime
        // SSE 特定的错误日志记录
        if (serverRef.type === 'sse' && error instanceof Error) {
          logMCPDebug(
            name,
            `SSE 连接在 ${elapsed}ms 后失败：${jsonStringify({
              url: serverRef.url,
              error: error.message,
              errorType: error.constructor.name,
              stack: error.stack,
            })}`,
          )
          logMCPError(name, error)

          if (error instanceof UnauthorizedError) {
            return handleRemoteAuthFailure(name, serverRef, 'sse')
          }
        } else if (serverRef.type === 'http' && error instanceof Error) {
          const errorObj = error as Error & {
            cause?: unknown
            code?: string
            errno?: string | number
            syscall?: string
          }
          logMCPDebug(
            name,
            `HTTP 连接在 ${elapsed}ms 后失败：${error.message}（code：${errorObj.code || '无'}，errno：${errorObj.errno || '无'}）`,
          )
          logMCPError(name, error)

          if (error instanceof UnauthorizedError) {
            return handleRemoteAuthFailure(name, serverRef, 'http')
          }
        } else if (
          serverRef.type === 'claudeai-proxy' &&
          error instanceof Error
        ) {
          logMCPDebug(
            name,
            `claude.ai 代理连接在 ${elapsed}ms 后失败：${error.message}`,
          )
          logMCPError(name, error)

          // StreamableHTTPError 具有带有 HTTP 状态的 `code` 属性
          const errorCode = (error as Error & { code?: number }).code
          if (errorCode === 401) {
            return handleRemoteAuthFailure(name, serverRef, 'claudeai-proxy')
          }
        } else if (
          serverRef.type === 'sse-ide' ||
          serverRef.type === 'ws-ide'
        ) {
          logEvent('tengu_mcp_ide_server_connection_failed', {
            connectionDurationMs: elapsed,
          })
        }
        if (inProcessServer) {
          inProcessServer.close().catch(() => {})
        }
        transport.close().catch(() => {})
        if (stderrOutput) {
          logMCPError(name, `服务器 stderr：${stderrOutput}`)
        }
        throw error
      }

      const capabilities = client.getServerCapabilities()
      const serverVersion = client.getServerVersion()
      const rawInstructions = client.getInstructions()
      let instructions = rawInstructions
      if (
        rawInstructions &&
        rawInstructions.length > MAX_MCP_DESCRIPTION_LENGTH
      ) {
        instructions =
          rawInstructions.slice(0, MAX_MCP_DESCRIPTION_LENGTH) + '… [已截断]'
        logMCPDebug(
          name,
          `服务器指令已从 ${rawInstructions.length} 截断至 ${MAX_MCP_DESCRIPTION_LENGTH} 个字符`,
        )
      }

      // 记录成功连接的详细信息
      logMCPDebug(
        name,
        `连接已建立，能力：${jsonStringify({
          hasTools: !!capabilities?.tools,
          hasPrompts: !!capabilities?.prompts,
          hasResources: !!capabilities?.resources,
          hasResourceSubscribe: !!capabilities?.resources?.subscribe,
          serverVersion: serverVersion || '未知',
        })}`,
      )
      logForDebugging(
        `[MCP] 服务器 "${name}" 已连接，subscribe=${!!capabilities?.resources?.subscribe}`,
      )

      // 注册默认的启发处理程序，在 registerElicitationHandler 于
      // onConnectionAttempt（useManageMCPConnections）中覆盖它之前返回取消。
      client.setRequestHandler(ElicitRequestSchema, async request => {
        logMCPDebug(
          name,
          `初始化期间收到启发请求：${jsonStringify(request)}`,
        )
        return { action: 'cancel' as const }
      })

      if (serverRef.type === 'sse-ide' || serverRef.type === 'ws-ide') {
        const ideConnectionDurationMs = Date.now() - connectStartTime
        logEvent('tengu_mcp_ide_server_connection_succeeded', {
          connectionDurationMs: ideConnectionDurationMs,
          serverVersion:
            serverVersion as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        try {
          void maybeNotifyIDEConnected(client)
        } catch (error) {
          logMCPError(
            name,
            `发送 ide_connected 通知失败：${error}`,
          )
        }
      }

      // 为所有传输类型增强连接断开检测和日志记录
      const connectionStartTime = Date.now()
      let hasErrorOccurred = false

      // 存储原始处理程序
      const originalOnerror = client.onerror
      const originalOnclose = client.onclose

      // SDK 的传输在连接失败时调用 onerror，但不调用 onclose，
      // 而 CC 使用 onclose 来触发重新连接。我们通过跟踪连续的
      // 终端错误并在 MAX_ERRORS_BEFORE_RECONNECT 次失败后手动关闭来弥合这一差距。
      let consecutiveConnectionErrors = 0
      const MAX_ERRORS_BEFORE_RECONNECT = 3

      // 防止重入：close() 会中止正在进行的流，这可能会在关闭链完成之前再次触发 onerror。
      let hasTriggeredClose = false

      // client.close() → transport.close() → transport.onclose → SDK 的 _onclose()：
      // 拒绝所有挂起的请求处理程序（因此挂起的 callTool() 承诺会因 McpError -32000“连接已关闭”而失败），
      // 然后调用我们下面的 client.onclose 处理程序（该处理程序清除记忆缓存，以便下次调用重新连接）。
      // 直接调用 client.onclose?.() 只会清除缓存 —— 挂起的工具调用将保持挂起状态。
      const closeTransportAndRejectPending = (reason: string) => {
        if (hasTriggeredClose) return
        hasTriggeredClose = true
        logMCPDebug(name, `正在关闭传输（${reason}）`)
        void client.close().catch(e => {
          logMCPDebug(name, `关闭期间出错：${errorMessage(e)}`)
        })
      }

      const isTerminalConnectionError = (msg: string): boolean => {
        return (
          msg.includes('ECONNRESET') ||
          msg.includes('ETIMEDOUT') ||
          msg.includes('EPIPE') ||
          msg.includes('EHOSTUNREACH') ||
          msg.includes('ECONNREFUSED') ||
          msg.includes('Body Timeout Error') ||
          msg.includes('terminated') ||
          // SDK SSE 重新连接的中间错误 —— 可能包装在实际网络错误周围，因此上面的子字符串不会匹配
          msg.includes('SSE stream disconnected') ||
          msg.includes('Failed to reconnect SSE stream')
        )
      }

      // 增强的错误处理程序，包含详细日志记录
      client.onerror = (error: Error) => {
        const uptime = Date.now() - connectionStartTime
        hasErrorOccurred = true
        const transportType = serverRef.type || 'stdio'

        // 记录带有上下文的连接断开情况
        logMCPDebug(
          name,
          `${transportType.toUpperCase()} 连接在运行 ${Math.floor(uptime / 1000)}秒后断开`,
        )

        // 记录具体的错误详情以便调试
        if (error.message) {
          if (error.message.includes('ECONNRESET')) {
            logMCPDebug(
              name,
              `连接重置 - 服务器可能已崩溃或重新启动`,
            )
          } else if (error.message.includes('ETIMEDOUT')) {
            logMCPDebug(
              name,
              `连接超时 - 网络问题或服务器无响应`,
            )
          } else if (error.message.includes('ECONNREFUSED')) {
            logMCPDebug(name, `连接被拒绝 - 服务器可能已关闭`)
          } else if (error.message.includes('EPIPE')) {
            logMCPDebug(
              name,
              `管道损坏 - 服务器意外关闭了连接`,
            )
          } else if (error.message.includes('EHOSTUNREACH')) {
            logMCPDebug(name, `主机不可达 - 网络连接问题`)
          } else if (error.message.includes('ESRCH')) {
            logMCPDebug(
              name,
              `未找到进程 - stdio 服务器进程已终止`,
            )
          } else if (error.message.includes('spawn')) {
            logMCPDebug(
              name,
              `生成进程失败 - 检查命令和权限`,
            )
          } else {
            logMCPDebug(name, `连接错误：${error.message}`)
          }
        }

        // 对于 HTTP 传输，检测会话过期（404 + JSON-RPC -32001）
        // 并关闭传输，以便挂起的工具调用失败，下次调用时使用新的会话 ID 重新连接。
        if (
          (transportType === 'http' || transportType === 'claudeai-proxy') &&
          isMcpSessionExpiredError(error)
        ) {
          logMCPDebug(
            name,
            `MCP 会话已过期（服务器返回 404 且未找到会话），触发重新连接`,
          )
          closeTransportAndRejectPending('会话已过期')
          if (originalOnerror) {
            originalOnerror(error)
          }
          return
        }

        // 对于远程传输（SSE/HTTP），跟踪终端连接错误，
        // 如果看到重复失败，则通过关闭触发重新连接。
        if (
          transportType === 'sse' ||
          transportType === 'http' ||
          transportType === 'claudeai-proxy'
        ) {
          // SDK 的 StreamableHTTP 传输在耗尽其自身的 SSE 重新连接尝试（默认 maxRetries: 2）后触发此错误，
          // 但它从不调用 onclose，因此挂起的 callTool() 承诺会无限期挂起。
          // 这是“传输放弃”的明确信号。
          if (error.message.includes('Maximum reconnection attempts')) {
            closeTransportAndRejectPending('SSE 重新连接尝试已耗尽')
            if (originalOnerror) {
              originalOnerror(error)
            }
            return
          }

          if (isTerminalConnectionError(error.message)) {
            consecutiveConnectionErrors++
            logMCPDebug(
              name,
              `终端连接错误 ${consecutiveConnectionErrors}/${MAX_ERRORS_BEFORE_RECONNECT}`,
            )

            if (consecutiveConnectionErrors >= MAX_ERRORS_BEFORE_RECONNECT) {
              consecutiveConnectionErrors = 0
              closeTransportAndRejectPending('达到最大连续终端错误数')
            }
          } else {
            // 非终端错误（例如瞬时问题），重置计数器
            consecutiveConnectionErrors = 0
          }
        }

        // 调用原始处理程序
        if (originalOnerror) {
          originalOnerror(error)
        }
      }

      // 增强的关闭处理程序，包含连接断开上下文
      client.onclose = () => {
        const uptime = Date.now() - connectionStartTime
        const transportType = serverRef.type ?? '未知'

        logMCPDebug(
          name,
          `${transportType.toUpperCase()} 连接在运行 ${Math.floor(uptime / 1000)}秒后关闭（${hasErrorOccurred ? '有错误' : '干净地'}）`,
        )

        // 清除记忆缓存，以便下次操作重新连接
        const key = getServerCacheKey(name, serverRef)

        // 同时清除 fetch 缓存（以服务器名称为键）。重新连接
        // 会创建一个新的连接对象；如果不清除，下次 fetch 会从旧连接返回陈旧的工具/资源。
        fetchToolsForClient.cache.delete(name)
        fetchResourcesForClient.cache.delete(name)
        fetchCommandsForClient.cache.delete(name)
        if (feature('MCP_SKILLS')) {
          fetchMcpSkillsForClient!.cache.delete(name)
        }

        connectToServer.cache.delete(key)
        logMCPDebug(name, `已清除连接缓存以便重新连接`)

        if (originalOnclose) {
          originalOnclose()
        }
      }

      const cleanup = async () => {
        // 进程内服务器（例如 Chrome MCP）没有子进程或 stderr
        if (inProcessServer) {
          try {
            await inProcessServer.close()
          } catch (error) {
            logMCPDebug(name, `关闭进程内服务器时出错：${error}`)
          }
          try {
            await client.close()
          } catch (error) {
            logMCPDebug(name, `关闭客户端时出错：${error}`)
          }
          return
        }

        // 移除 stderr 事件监听器以防止内存泄漏
        if (stderrHandler && (serverRef.type === 'stdio' || !serverRef.type)) {
          const stdioTransport = transport as StdioClientTransport
          stdioTransport.stderr?.off('data', stderrHandler)
        }

        // 对于 stdio 传输，显式使用适当的信号终止子进程
        // 注意：StdioClientTransport.close() 只发送中止信号，但许多 MCP 服务器
        // （尤其是 Docker 容器）需要明确的 SIGINT/SIGTERM 信号来触发优雅关闭
        if (serverRef.type === 'stdio') {
          try {
            const stdioTransport = transport as StdioClientTransport
            const childPid = stdioTransport.pid

            if (childPid) {
              logMCPDebug(name, '正在向 MCP 服务器进程发送 SIGINT')

              // 首先尝试 SIGINT（如 Ctrl+C）
              try {
                process.kill(childPid, 'SIGINT')
              } catch (error) {
                logMCPDebug(name, `发送 SIGINT 时出错：${error}`)
                return
              }

              // 等待优雅关闭并快速升级（总计 500ms 以保持 CLI 响应）
              await new Promise<void>(async resolve => {
                let resolved = false

                // 设置计时器检查进程是否仍然存在
                const checkInterval = setInterval(() => {
                  try {
                    // process.kill(pid, 0) 检查进程是否存在而不杀死它
                    process.kill(childPid, 0)
                  } catch {
                    // 进程不再存在
                    if (!resolved) {
                      resolved = true
                      clearInterval(checkInterval)
                      clearTimeout(failsafeTimeout)
                      logMCPDebug(name, 'MCP 服务器进程已干净退出')
                      resolve()
                    }
                  }
                }, 50)

                // 绝对故障安全：无论如何在 600ms 后清除间隔
                const failsafeTimeout = setTimeout(() => {
                  if (!resolved) {
                    resolved = true
                    clearInterval(checkInterval)
                    logMCPDebug(
                      name,
                      '清理超时已到，停止进程监控',
                    )
                    resolve()
                  }
                }, 600)

                try {
                  // 等待 100ms 让 SIGINT 生效（通常快得多）
                  await sleep(100)

                  if (!resolved) {
                    // 检查进程是否仍然存在
                    try {
                      process.kill(childPid, 0)
                      // 进程仍然存在，SIGINT 失败，尝试 SIGTERM
                      logMCPDebug(
                        name,
                        'SIGINT 失败，正在向 MCP 服务器进程发送 SIGTERM',
                      )
                      try {
                        process.kill(childPid, 'SIGTERM')
                      } catch (termError) {
                        logMCPDebug(name, `发送 SIGTERM 时出错：${termError}`)
                        resolved = true
                        clearInterval(checkInterval)
                        clearTimeout(failsafeTimeout)
                        resolve()
                        return
                      }
                    } catch {
                      // 进程已退出
                      resolved = true
                      clearInterval(checkInterval)
                      clearTimeout(failsafeTimeout)
                      resolve()
                      return
                    }

                    // 等待 400ms 让 SIGTERM 生效（比 SIGINT 慢，通常用于清理）
                    await sleep(400)

                    if (!resolved) {
                      // 检查进程是否仍然存在
                      try {
                        process.kill(childPid, 0)
                        // 进程仍然存在，SIGTERM 失败，使用 SIGKILL 强制终止
                        logMCPDebug(
                          name,
                          'SIGTERM 失败，正在向 MCP 服务器进程发送 SIGKILL',
                        )
                        try {
                          process.kill(childPid, 'SIGKILL')
                        } catch (killError) {
                          logMCPDebug(
                            name,
                            `发送 SIGKILL 时出错：${killError}`,
                          )
                        }
                      } catch {
                        // 进程已退出
                        resolved = true
                        clearInterval(checkInterval)
                        clearTimeout(failsafeTimeout)
                        resolve()
                      }
                    }
                  }

                  // 最终超时 - 最多 500ms 后始终解决（总清理时间）
                  if (!resolved) {
                    resolved = true
                    clearInterval(checkInterval)
                    clearTimeout(failsafeTimeout)
                    resolve()
                  }
                } catch {
                  // 处理升级序列中的任何错误
                  if (!resolved) {
                    resolved = true
                    clearInterval(checkInterval)
                    clearTimeout(failsafeTimeout)
                    resolve()
                  }
                }
              })
            }
          } catch (processError) {
            logMCPDebug(name, `终止进程时出错：${processError}`)
          }
        }

        // 关闭客户端连接（同时也会关闭传输）
        try {
          await client.close()
        } catch (error) {
          logMCPDebug(name, `关闭客户端时出错：${error}`)
        }
      }

      // 为所有传输类型注册清理——即使是网络传输也可能需要清理
      // 这确保所有 MCP 服务器都被正确终止，而不仅仅是 stdio 服务器
      const cleanupUnregister = registerCleanup(cleanup)

      // 创建包含注销功能的包装清理
      const wrappedCleanup = async () => {
        cleanupUnregister?.()
        await cleanup()
      }

      const connectionDurationMs = Date.now() - connectStartTime
      logEvent('tengu_mcp_server_connection_succeeded', {
        connectionDurationMs,
        transportType: (serverRef.type ??
          'stdio') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        totalServers: serverStats?.totalServers,
        stdioCount: serverStats?.stdioCount,
        sseCount: serverStats?.sseCount,
        httpCount: serverStats?.httpCount,
        sseIdeCount: serverStats?.sseIdeCount,
        wsIdeCount: serverStats?.wsIdeCount,
        ...mcpBaseUrlAnalytics(serverRef),
      })
      return {
        name,
        client,
        type: 'connected' as const,
        capabilities: capabilities ?? {},
        serverInfo: serverVersion,
        instructions,
        config: serverRef,
        cleanup: wrappedCleanup,
      }
    } catch (error) {
      const connectionDurationMs = Date.now() - connectStartTime
      logEvent('tengu_mcp_server_connection_failed', {
        connectionDurationMs,
        totalServers: serverStats?.totalServers || 1,
        stdioCount:
          serverStats?.stdioCount || (serverRef.type === 'stdio' ? 1 : 0),
        sseCount: serverStats?.sseCount || (serverRef.type === 'sse' ? 1 : 0),
        httpCount:
          serverStats?.httpCount || (serverRef.type === 'http' ? 1 : 0),
        sseIdeCount:
          serverStats?.sseIdeCount || (serverRef.type === 'sse-ide' ? 1 : 0),
        wsIdeCount:
          serverStats?.wsIdeCount || (serverRef.type === 'ws-ide' ? 1 : 0),
        transportType: (serverRef.type ??
          'stdio') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        ...mcpBaseUrlAnalytics(serverRef),
      })
      logMCPDebug(
        name,
        `连接在 ${connectionDurationMs}ms 后失败：${errorMessage(error)}`,
      )
      logMCPError(name, `连接失败：${errorMessage(error)}`)

      if (inProcessServer) {
        inProcessServer.close().catch(() => {})
      }
      return {
        name,
        type: 'failed' as const,
        config: serverRef,
        error: errorMessage(error),
      }
    }
  },
  getServerCacheKey,
)

/**
 * 清除特定服务器的记忆缓存
 * @param name 服务器名称
 * @param serverRef 服务器配置
 */
export async function clearServerCache(
  name: string,
  serverRef: ScopedMcpServerConfig,
): Promise<void> {
  const key = getServerCacheKey(name, serverRef)

  try {
    const wrappedClient = await connectToServer(name, serverRef)

    if (wrappedClient.type === 'connected') {
      await wrappedClient.cleanup()
    }
  } catch {
    // 忽略错误 - 服务器可能连接失败
  }

  // 从缓存中清除（包括连接缓存和 fetch 缓存，以便重新连接时获取新的工具/资源/命令，而不是陈旧的）
  connectToServer.cache.delete(key)
  fetchToolsForClient.cache.delete(name)
  fetchResourcesForClient.cache.delete(name)
  fetchCommandsForClient.cache.delete(name)
  if (feature('MCP_SKILLS')) {
    fetchMcpSkillsForClient!.cache.delete(name)
  }
}

/**
 * 确保为 MCP 服务器提供一个有效的已连接客户端。
 * 对于大多数服务器类型，如果记忆缓存可用则使用它，或者如果缓存被清除（例如在 onclose 之后）则重新连接。
 * 这确保了工具/资源调用始终使用有效的连接。
 *
 * SDK MCP 服务器在进程内运行，并通过 setupSdkMcpClients 单独处理，
 * 因此它们按原样返回，而不通过 connectToServer。
 *
 * @param client 已连接的 MCP 服务器客户端
 * @returns 已连接的 MCP 服务器客户端（相同或重新连接后的）
 * @throws 如果服务器无法连接则抛出错误
 */
export async function ensureConnectedClient(
  client: ConnectedMCPServer,
): Promise<ConnectedMCPServer> {
  // SDK MCP 服务器在进程内运行，并通过 setupSdkMcpClients 单独处理
  if (client.config.type === 'sdk') {
    return client
  }

  const connectedClient = await connectToServer(client.name, client.config)
  if (connectedClient.type !== 'connected') {
    throw new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
      `MCP 服务器 "${client.name}" 未连接`,
      'MCP 服务器未连接',
    )
  }
  return connectedClient
}

/**
 * 比较两个 MCP 服务器配置以确定它们是否等效。
 * 用于检测何时因配置更改而需要重新连接服务器。
 */
export function areMcpConfigsEqual(
  a: ScopedMcpServerConfig,
  b: ScopedMcpServerConfig,
): boolean {
  // 首先快速进行类型检查
  if (a.type !== b.type) return false

  // 通过序列化进行比较——这处理了所有配置变体
  // 我们排除 'scope'，因为它是元数据，而不是连接配置
  const { scope: _scopeA, ...configA } = a
  const { scope: _scopeB, ...configB } = b
  return jsonStringify(configA) === jsonStringify(configB)
}

// fetch* 缓存的最大缓存大小。以服务器名称为键（在重新连接期间稳定），
// 限制以防止 MCP 服务器数量过多时无限增长。
const MCP_FETCH_CACHE_SIZE = 20

/**
 * 为自动模式安全分类器编码 MCP 工具输入。
 * 导出此函数，以便自动模式评估脚本可以在不重复此逻辑的情况下
 * 为 `mcp__*` 工具存根镜像生产编码。
 */
export function mcpToolInputToAutoClassifierInput(
  input: Record<string, unknown>,
  toolName: string,
): string {
  const keys = Object.keys(input)
  return keys.length > 0
    ? keys.map(k => `${k}=${String(input[k])}`).join(' ')
    : toolName
}

export const fetchToolsForClient = memoizeWithLRU(
  async (client: MCPServerConnection): Promise<Tool[]> => {
    if (client.type !== 'connected') return []

    try {
      if (!client.capabilities?.tools) {
        return []
      }

      const result = (await client.client.request(
        { method: 'tools/list' },
        ListToolsResultSchema,
      )) as ListToolsResult

      // 清理来自 MCP 服务器的工具数据
      const toolsToProcess = recursivelySanitizeUnicode(result.tools)

      // 检查是否应为 SDK MCP 服务器跳过 mcp__ 前缀
      const skipPrefix =
        client.config.type === 'sdk' &&
        isEnvTruthy(process.env.CLAUDE_AGENT_SDK_MCP_NO_PREFIX)

      // 将 MCP 工具转换为我们的 Tool 格式
      return toolsToProcess
        .map((tool): Tool => {
          const fullyQualifiedName = buildMcpToolName(client.name, tool.name)
          return {
            ...MCPTool,
            // 在跳过前缀模式下，使用原始名称进行模型调用，以便 MCP 工具可以通过名称覆盖内置工具。
            // mcpInfo 用于权限检查。
            name: skipPrefix ? tool.name : fullyQualifiedName,
            mcpInfo: { serverName: client.name, toolName: tool.name },
            isMcp: true,
            // 折叠空白：_meta 对任何外部 MCP 服务器开放，
            // 此处的换行符会将孤行注入延迟工具列表（formatDeferredToolLine 在 '\n' 上连接）。
            searchHint:
              typeof tool._meta?.['anthropic/searchHint'] === 'string'
                ? tool._meta['anthropic/searchHint']
                    .replace(/\s+/g, ' ')
                    .trim() || undefined
                : undefined,
            alwaysLoad: tool._meta?.['anthropic/alwaysLoad'] === true,
            async description() {
              return tool.description ?? ''
            },
            async prompt() {
              const desc = tool.description ?? ''
              return desc.length > MAX_MCP_DESCRIPTION_LENGTH
                ? desc.slice(0, MAX_MCP_DESCRIPTION_LENGTH) + '… [已截断]'
                : desc
            },
            isConcurrencySafe() {
              return tool.annotations?.readOnlyHint ?? false
            },
            isReadOnly() {
              return tool.annotations?.readOnlyHint ?? false
            },
            toAutoClassifierInput(input) {
              return mcpToolInputToAutoClassifierInput(input, tool.name)
            },
            isDestructive() {
              return tool.annotations?.destructiveHint ?? false
            },
            isOpenWorld() {
              return tool.annotations?.openWorldHint ?? false
            },
            isSearchOrReadCommand() {
              return classifyMcpToolForCollapse(client.name, tool.name)
            },
            inputJSONSchema: tool.inputSchema as Tool['inputJSONSchema'],
            async checkPermissions() {
              return {
                behavior: 'passthrough' as const,
                message: 'MCP 工具需要权限。',
                suggestions: [
                  {
                    type: 'addRules' as const,
                    rules: [
                      {
                        toolName: fullyQualifiedName,
                        ruleContent: undefined,
                      },
                    ],
                    behavior: 'allow' as const,
                    destination: 'localSettings' as const,
                  },
                ],
              }
            },
            async call(
              args: Record<string, unknown>,
              context,
              _canUseTool,
              parentMessage,
              onProgress?: ToolCallProgress<MCPProgress>,
            ) {
              const toolUseId = extractToolUseId(parentMessage)
              const meta = toolUseId
                ? { 'claudecode/toolUseId': toolUseId }
                : {}

              // 工具启动时发送进度
              if (onProgress && toolUseId) {
                onProgress({
                  toolUseID: toolUseId,
                  data: {
                    type: 'mcp_progress',
                    status: 'started',
                    serverName: client.name,
                    toolName: tool.name,
                  },
                })
              }

              const startTime = Date.now()
              const MAX_SESSION_RETRIES = 1
              for (let attempt = 0; ; attempt++) {
                try {
                  const connectedClient = await ensureConnectedClient(client)
                  const mcpResult = await callMCPToolWithUrlElicitationRetry({
                    client: connectedClient,
                    clientConnection: client,
                    tool: tool.name,
                    args,
                    meta,
                    signal: context.abortController.signal,
                    setAppState: context.setAppState,
                    onProgress:
                      onProgress && toolUseId
                        ? progressData => {
                            onProgress({
                              toolUseID: toolUseId,
                              data: progressData,
                            })
                          }
                        : undefined,
                    handleElicitation: context.handleElicitation,
                  })

                  // 工具成功完成时发送进度
                  if (onProgress && toolUseId) {
                    onProgress({
                      toolUseID: toolUseId,
                      data: {
                        type: 'mcp_progress',
                        status: 'completed',
                        serverName: client.name,
                        toolName: tool.name,
                        elapsedTimeMs: Date.now() - startTime,
                      },
                    })
                  }

                  return {
                    data: mcpResult.content,
                    ...((mcpResult._meta || mcpResult.structuredContent) && {
                      mcpMeta: {
                        ...(mcpResult._meta && {
                          _meta: mcpResult._meta,
                        }),
                        ...(mcpResult.structuredContent && {
                          structuredContent: mcpResult.structuredContent,
                        }),
                      },
                    }),
                  }
                } catch (error) {
                  // 会话过期 —— 连接缓存已被清除，因此使用新客户端重试。
                  if (
                    error instanceof McpSessionExpiredError &&
                    attempt < MAX_SESSION_RETRIES
                  ) {
                    logMCPDebug(
                      client.name,
                      `会话恢复后重试工具 '${tool.name}'`,
                    )
                    continue
                  }

                  // 工具失败时发送进度
                  if (onProgress && toolUseId) {
                    onProgress({
                      toolUseID: toolUseId,
                      data: {
                        type: 'mcp_progress',
                        status: 'failed',
                        serverName: client.name,
                        toolName: tool.name,
                        elapsedTimeMs: Date.now() - startTime,
                      },
                    })
                  }
                  // 包装 MCP SDK 错误，以便遥测获得有用的上下文，
                  // 而不仅仅是 "Error" 或 "McpError"（构造函数名称）。
                  // MCP SDK 错误是协议级别的消息，不包含用户文件路径或代码。
                  if (
                    error instanceof Error &&
                    !(
                      error instanceof
                      TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
                    )
                  ) {
                    const name = error.constructor.name
                    if (name === 'Error') {
                      throw new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
                        error.message,
                        error.message.slice(0, 200),
                      )
                    }
                    // McpError 具有带有 JSON-RPC 错误代码的数字 `code`
                    // （例如 -32000 ConnectionClosed，-32001 RequestTimeout）
                    if (
                      name === 'McpError' &&
                      'code' in error &&
                      typeof error.code === 'number'
                    ) {
                      throw new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
                        error.message,
                        `McpError ${error.code}`,
                      )
                    }
                  }
                  throw error
                }
              }
            },
            userFacingName() {
              // 如果有标题注解，则优先使用，否则使用工具名称
              const displayName = tool.annotations?.title || tool.name
              return `${client.name} - ${displayName} (MCP)`
            },
            ...(isClaudeInChromeMCPServer(client.name) &&
            (client.config.type === 'stdio' || !client.config.type)
              ? claudeInChromeToolRendering().getClaudeInChromeMCPToolOverrides(
                  tool.name,
                )
              : {}),
            ...(feature('CHICAGO_MCP') &&
            (client.config.type === 'stdio' || !client.config.type) &&
            isComputerUseMCPServer!(client.name)
              ? computerUseWrapper!().getComputerUseMCPToolOverrides(tool.name)
              : {}),
          }
        })
        .filter(isIncludedMcpTool)
    } catch (error) {
      logMCPError(client.name, `获取工具失败：${errorMessage(error)}`)
      return []
    }
  },
  (client: MCPServerConnection) => client.name,
  MCP_FETCH_CACHE_SIZE,
)

export const fetchResourcesForClient = memoizeWithLRU(
  async (client: MCPServerConnection): Promise<ServerResource[]> => {
    if (client.type !== 'connected') return []

    try {
      if (!client.capabilities?.resources) {
        return []
      }

      const result = await client.client.request(
        { method: 'resources/list' },
        ListResourcesResultSchema,
      )

      if (!result.resources) return []

      // 为每个资源添加服务器名称
      return result.resources.map(resource => ({
        ...resource,
        server: client.name,
      }))
    } catch (error) {
      logMCPError(
        client.name,
        `获取资源失败：${errorMessage(error)}`,
      )
      return []
    }
  },
  (client: MCPServerConnection) => client.name,
  MCP_FETCH_CACHE_SIZE,
)

export const fetchCommandsForClient = memoizeWithLRU(
  async (client: MCPServerConnection): Promise<Command[]> => {
    if (client.type !== 'connected') return []

    try {
      if (!client.capabilities?.prompts) {
        return []
      }

      // 从客户端请求 prompts 列表
      const result = (await client.client.request(
        { method: 'prompts/list' },
        ListPromptsResultSchema,
      )) as ListPromptsResult

      if (!result.prompts) return []

      // 清理来自 MCP 服务器的 prompts 数据
      const promptsToProcess = recursivelySanitizeUnicode(result.prompts)

      // 将 MCP prompts 转换为我们的 Command 格式
      return promptsToProcess.map(prompt => {
        const argNames = Object.values(prompt.arguments ?? {}).map(k => k.name)
        return {
          type: 'prompt' as const,
          name: 'mcp__' + normalizeNameForMCP(client.name) + '__' + prompt.name,
          description: prompt.description ?? '',
          hasUserSpecifiedDescription: !!prompt.description,
          contentLength: 0, // 动态 MCP 内容
          isEnabled: () => true,
          isHidden: false,
          isMcp: true,
          progressMessage: '运行中',
          userFacingName() {
            // 使用 prompt.name（程序标识符）而不是 prompt.title（显示名称）
            // 以避免空格破坏斜杠命令解析
            return `${client.name}:${prompt.name} (MCP)`
          },
          argNames,
          source: 'mcp',
          async getPromptForCommand(args: string) {
            const argsArray = args.split(' ')
            try {
              const connectedClient = await ensureConnectedClient(client)
              const result = await connectedClient.client.getPrompt({
                name: prompt.name,
                arguments: zipObject(argNames, argsArray),
              })
              const transformed = await Promise.all(
                result.messages.map(message =>
                  transformResultContent(message.content, connectedClient.name),
                ),
              )
              return transformed.flat()
            } catch (error) {
              logMCPError(
                client.name,
                `运行命令 '${prompt.name}' 时出错：${errorMessage(error)}`,
              )
              throw error
            }
          },
        }
      })
    } catch (error) {
      logMCPError(
        client.name,
        `获取命令失败：${errorMessage(error)}`,
      )
      return []
    }
  },
  (client: MCPServerConnection) => client.name,
  MCP_FETCH_CACHE_SIZE,
)

/**
 * 作为 RPC 直接调用 IDE 工具
 * @param toolName 要调用的工具名称
 * @param args 传递给工具的参数
 * @param client 用于 RPC 调用的 IDE 客户端
 * @returns 工具调用的结果
 */
export async function callIdeRpc(
  toolName: string,
  args: Record<string, unknown>,
  client: ConnectedMCPServer,
): Promise<string | ContentBlockParam[] | undefined> {
  const result = await callMCPTool({
    client,
    tool: toolName,
    args,
    signal: createAbortController().signal,
  })
  return result.content
}

/**
 * 注意：UI 组件不应直接调用此函数，它们应使用 useManageMcpConnections 中的 reconnectMcpServer 函数。
 * @param name 服务器名称
 * @param config 服务器配置
 * @returns 包含客户端连接及其资源的对象
 */
export async function reconnectMcpServerImpl(
  name: string,
  config: ScopedMcpServerConfig,
): Promise<{
  client: MCPServerConnection
  tools: Tool[]
  commands: Command[]
  resources?: ServerResource[]
}> {
  try {
    // 使钥匙串缓存失效，以便我们从磁盘读取新的凭据。
    // 当另一个进程（例如 VS Code 扩展主机）修改了存储的令牌（清除身份验证、保存新的 OAuth 令牌）后，
    // 要求 CLI 子进程重新连接时，这是必需的。如果不这样做，子进程将使用陈旧的缓存数据，永远不会注意到令牌已被移除。
    clearKeychainCache()

    await clearServerCache(name, config)
    const client = await connectToServer(name, config)

    if (client.type !== 'connected') {
      return {
        client,
        tools: [],
        commands: [],
      }
    }

    if (config.type === 'claudeai-proxy') {
      markClaudeAiMcpConnected(name)
    }

    const supportsResources = !!client.capabilities?.resources

    const [tools, mcpCommands, mcpSkills, resources] = await Promise.all([
      fetchToolsForClient(client),
      fetchCommandsForClient(client),
      feature('MCP_SKILLS') && supportsResources
        ? fetchMcpSkillsForClient!(client)
        : Promise.resolve([]),
      supportsResources ? fetchResourcesForClient(client) : Promise.resolve([]),
    ])
    const commands = [...mcpCommands, ...mcpSkills]

    // 检查是否需要添加资源工具
    const resourceTools: Tool[] = []
    if (supportsResources) {
      // 仅当没有其他服务器拥有它们时才添加资源工具
      const hasResourceTools = [ListMcpResourcesTool, ReadMcpResourceTool].some(
        tool => tools.some(t => toolMatchesName(t, tool.name)),
      )
      if (!hasResourceTools) {
        resourceTools.push(ListMcpResourcesTool, ReadMcpResourceTool)
      }
    }

    return {
      client,
      tools: [...tools, ...resourceTools],
      commands,
      resources: resources.length > 0 ? resources : undefined,
    }
  } catch (error) {
    // 优雅地处理错误 —— 连接可能在获取期间关闭
    logMCPError(name, `重新连接期间出错：${errorMessage(error)}`)

    // 返回失败状态
    return {
      client: { name, type: 'failed' as const, config },
      tools: [],
      commands: [],
    }
  }
}

// 已于 2026 年 3 月替换：之前的实现运行固定大小的顺序批次
// （完全等待批次 1，然后开始批次 2）。这意味着批次 N 中的一个慢速服务器
// 会阻碍批次 N+1 中的所有服务器，即使其他 19 个插槽空闲。pMap 在服务器完成后立即释放每个插槽，
// 因此单个慢速服务器只占用一个插槽，而不是阻塞整个批处理边界。
// 相同的并发上限，相同的结果，更好的调度。
async function processBatched<T>(
  items: T[],
  concurrency: number,
  processor: (item: T) => Promise<void>,
): Promise<void> {
  await pMap(items, processor, { concurrency })
}

export async function getMcpToolsCommandsAndResources(
  onConnectionAttempt: (params: {
    client: MCPServerConnection
    tools: Tool[]
    commands: Command[]
    resources?: ServerResource[]
  }) => void,
  mcpConfigs?: Record<string, ScopedMcpServerConfig>,
): Promise<void> {
  let resourceToolsAdded = false

  const allConfigEntries = Object.entries(
    mcpConfigs ?? (await getAllMcpConfigs()).servers,
  )

  // 分区为已禁用和活动条目 —— 禁用的服务器不应产生 HTTP 连接或流经批处理
  const configEntries: typeof allConfigEntries = []
  for (const entry of allConfigEntries) {
    if (isMcpServerDisabled(entry[0])) {
      onConnectionAttempt({
        client: { name: entry[0], type: 'disabled', config: entry[1] },
        tools: [],
        commands: [],
      })
    } else {
      configEntries.push(entry)
    }
  }

  // 计算传输计数以供日志记录
  const totalServers = configEntries.length
  const stdioCount = count(configEntries, ([_, c]) => c.type === 'stdio')
  const sseCount = count(configEntries, ([_, c]) => c.type === 'sse')
  const httpCount = count(configEntries, ([_, c]) => c.type === 'http')
  const sseIdeCount = count(configEntries, ([_, c]) => c.type === 'sse-ide')
  const wsIdeCount = count(configEntries, ([_, c]) => c.type === 'ws-ide')

  // 按类型拆分服务器：本地（stdio/sdk）由于进程生成需要较低的并发，
  // 远程服务器可以以更高的并发连接
  const localServers = configEntries.filter(([_, config]) =>
    isLocalMcpServer(config),
  )
  const remoteServers = configEntries.filter(
    ([_, config]) => !isLocalMcpServer(config),
  )

  const serverStats = {
    totalServers,
    stdioCount,
    sseCount,
    httpCount,
    sseIdeCount,
    wsIdeCount,
  }

  const processServer = async ([name, config]: [
    string,
    ScopedMcpServerConfig,
  ]): Promise<void> => {
    try {
      // 检查服务器是否被禁用 - 如果是，则将其添加到状态而不连接
      if (isMcpServerDisabled(name)) {
        onConnectionAttempt({
          client: {
            name,
            type: 'disabled',
            config,
          },
          tools: [],
          commands: [],
        })
        return
      }

      // 跳过最近返回 401（15 分钟 TTL）的服务器，或者我们之前探测过但没有令牌的服务器。
      // 第二个检查弥补了 TTL 留下的空白：没有它，每 15 分钟我们都会重新探测那些在用户运行 /mcp 之前无法成功的服务器。
      // 每次探测都是 connect-401 的网络往返加上 OAuth 发现，而打印模式等待整个批次（main.tsx:3503）。
      if (
        (config.type === 'claudeai-proxy' ||
          config.type === 'http' ||
          config.type === 'sse') &&
        ((await isMcpAuthCached(name)) ||
          ((config.type === 'http' || config.type === 'sse') &&
            hasMcpDiscoveryButNoToken(name, config)))
      ) {
        logMCPDebug(name, `跳过连接（已缓存需要身份验证）`)
        onConnectionAttempt({
          client: { name, type: 'needs-auth' as const, config },
          tools: [createMcpAuthTool(name, config)],
          commands: [],
        })
        return
      }

      const client = await connectToServer(name, config, serverStats)

      if (client.type !== 'connected') {
        onConnectionAttempt({
          client,
          tools:
            client.type === 'needs-auth'
              ? [createMcpAuthTool(name, config)]
              : [],
          commands: [],
        })
        return
      }

      if (config.type === 'claudeai-proxy') {
        markClaudeAiMcpConnected(name)
      }

      const supportsResources = !!client.capabilities?.resources

      const [tools, mcpCommands, mcpSkills, resources] = await Promise.all([
        fetchToolsForClient(client),
        fetchCommandsForClient(client),
        // 从 skill:// 资源中发现技能
        feature('MCP_SKILLS') && supportsResources
          ? fetchMcpSkillsForClient!(client)
          : Promise.resolve([]),
        // 如果支持则获取资源
        supportsResources
          ? fetchResourcesForClient(client)
          : Promise.resolve([]),
      ])
      const commands = [...mcpCommands, ...mcpSkills]

      // 如果此服务器有资源且我们尚未添加资源工具，
      // 则将我们的资源工具包含在此客户端的工具中
      const resourceTools: Tool[] = []
      if (supportsResources && !resourceToolsAdded) {
        resourceToolsAdded = true
        resourceTools.push(ListMcpResourcesTool, ReadMcpResourceTool)
      }

      onConnectionAttempt({
        client,
        tools: [...tools, ...resourceTools],
        commands,
        resources: resources.length > 0 ? resources : undefined,
      })
    } catch (error) {
      // 优雅地处理错误 —— 连接可能在获取期间关闭
      logMCPError(
        name,
        `获取工具/命令/资源时出错：${errorMessage(error)}`,
      )

      // 仍然使用客户端更新，但没有工具/命令
      onConnectionAttempt({
        client: { name, type: 'failed' as const, config },
        tools: [],
        commands: [],
      })
    }
  }

  // 并发处理两个组，每个组有自己的并发限制：
  // - 本地服务器（stdio/sdk）：较低的并发以避免进程生成资源争用
  // - 远程服务器：较高的并发，因为它们只是网络连接
  await Promise.all([
    processBatched(
      localServers,
      getMcpServerConnectionBatchSize(),
      processServer,
    ),
    processBatched(
      remoteServers,
      getRemoteMcpServerConnectionBatchSize(),
      processServer,
    ),
  ])
}

// 未使用记忆化：仅在启动/重新配置时调用 2-3 次。内部工作
// （connectToServer、fetch*ForClient）已经缓存。在此处通过 mcpConfigs 对象引用进行记忆化会导致泄漏 ——
// main.tsx 每次调用都会创建新的配置对象。
export function prefetchAllMcpResources(
  mcpConfigs: Record<string, ScopedMcpServerConfig>,
): Promise<{
  clients: MCPServerConnection[]
  tools: Tool[]
  commands: Command[]
}> {
  return new Promise(resolve => {
    let pendingCount = 0
    let completedCount = 0

    pendingCount = Object.keys(mcpConfigs).length

    if (pendingCount === 0) {
      void resolve({
        clients: [],
        tools: [],
        commands: [],
      })
      return
    }

    const clients: MCPServerConnection[] = []
    const tools: Tool[] = []
    const commands: Command[] = []

    getMcpToolsCommandsAndResources(result => {
      clients.push(result.client)
      tools.push(...result.tools)
      commands.push(...result.commands)

      completedCount++
      if (completedCount >= pendingCount) {
        const commandsMetadataLength = commands.reduce((sum, command) => {
          const commandMetadataLength =
            command.name.length +
            (command.description ?? '').length +
            (command.argumentHint ?? '').length
          return sum + commandMetadataLength
        }, 0)
        logEvent('tengu_mcp_tools_commands_loaded', {
          tools_count: tools.length,
          commands_count: commands.length,
          commands_metadata_length: commandsMetadataLength,
        })

        void resolve({
          clients,
          tools,
          commands,
        })
      }
    }, mcpConfigs).catch(error => {
      logMCPError(
        'prefetchAllMcpResources',
        `获取 MCP 资源失败：${errorMessage(error)}`,
      )
      // 仍然以空结果解决
      void resolve({
        clients: [],
        tools: [],
        commands: [],
      })
    })
  })
}

/**
 * 将 MCP 工具或 MCP 提示的结果内容转换为消息块
 */
export async function transformResultContent(
  resultContent: PromptMessage['content'],
  serverName: string,
): Promise<Array<ContentBlockParam>> {
  switch (resultContent.type) {
    case 'text':
      return [
        {
          type: 'text',
          text: resultContent.text,
        },
      ]
    case 'audio': {
      const audioData = resultContent as {
        type: 'audio'
        data: string
        mimeType?: string
      }
      return await persistBlobToTextBlock(
        Buffer.from(audioData.data, 'base64'),
        audioData.mimeType,
        serverName,
        `[来自 ${serverName} 的音频] `,
      )
    }
    case 'image': {
      // 调整图像大小并压缩，强制遵守 API 尺寸限制
      const imageBuffer = Buffer.from(String(resultContent.data), 'base64')
      const ext = resultContent.mimeType?.split('/')[1] || 'png'
      const resized = await maybeResizeAndDownsampleImageBuffer(
        imageBuffer,
        imageBuffer.length,
        ext,
      )
      return [
        {
          type: 'image',
          source: {
            data: resized.buffer.toString('base64'),
            media_type:
              `image/${resized.mediaType}` as Base64ImageSource['media_type'],
            type: 'base64',
          },
        },
      ]
    }
    case 'resource': {
      const resource = resultContent.resource
      const prefix = `[来自 ${serverName} 的资源，位于 ${resource.uri}] `

      if ('text' in resource) {
        return [
          {
            type: 'text',
            text: `${prefix}${resource.text}`,
          },
        ]
      } else if ('blob' in resource) {
        const isImage = IMAGE_MIME_TYPES.has(resource.mimeType ?? '')

        if (isImage) {
          // 调整图像 blob 大小并压缩，强制遵守 API 尺寸限制
          const imageBuffer = Buffer.from(resource.blob, 'base64')
          const ext = resource.mimeType?.split('/')[1] || 'png'
          const resized = await maybeResizeAndDownsampleImageBuffer(
            imageBuffer,
            imageBuffer.length,
            ext,
          )
          const content: MessageParam['content'] = []
          if (prefix) {
            content.push({
              type: 'text',
              text: prefix,
            })
          }
          content.push({
            type: 'image',
            source: {
              data: resized.buffer.toString('base64'),
              media_type:
                `image/${resized.mediaType}` as Base64ImageSource['media_type'],
              type: 'base64',
            },
          })
          return content
        } else {
          return await persistBlobToTextBlock(
            Buffer.from(resource.blob, 'base64'),
            resource.mimeType,
            serverName,
            prefix,
          )
        }
      }
      return []
    }
    case 'resource_link': {
      const resourceLink = resultContent as ResourceLink
      let text = `[资源链接：${resourceLink.name}] ${resourceLink.uri}`
      if (resourceLink.description) {
        text += ` (${resourceLink.description})`
      }
      return [
        {
          type: 'text',
          text,
        },
      ]
    }
    default:
      return []
  }
}

/**
 * 解码 base64 二进制内容，使用正确的扩展名将其写入磁盘，
 * 并返回一个包含文件路径的小文本块。替换了之前将原始 base64 转储到上下文中的旧行为。
 */
async function persistBlobToTextBlock(
  bytes: Buffer,
  mimeType: string | undefined,
  serverName: string,
  sourceDescription: string,
): Promise<Array<ContentBlockParam>> {
  const persistId = `mcp-${normalizeNameForMCP(serverName)}-blob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const result = await persistBinaryContent(bytes, mimeType, persistId)

  if ('error' in result) {
    return [
      {
        type: 'text',
        text: `${sourceDescription}二进制内容（${mimeType || '未知类型'}，${bytes.length} 字节）无法保存到磁盘：${result.error}`,
      },
    ]
  }

  return [
    {
      type: 'text',
      text: getBinaryBlobSavedMessage(
        result.filepath,
        mimeType,
        result.size,
        sourceDescription,
      ),
    },
  ]
}

/**
 * 将 MCP 工具结果处理为规范化格式。
 */
export type MCPResultType = 'toolResult' | 'structuredContent' | 'contentArray'

export type TransformedMCPResult = {
  content: MCPToolResult
  type: MCPResultType
  schema?: string
}

/**
 * 为值生成紧凑的、jq 友好的类型签名。
 * 例如："{title: string, items: [{id: number, name: string}]}"
 */
export function inferCompactSchema(value: unknown, depth = 2): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return `[${inferCompactSchema(value[0], depth - 1)}]`
  }
  if (typeof value === 'object') {
    if (depth <= 0) return '{...}'
    const entries = Object.entries(value).slice(0, 10)
    const props = entries.map(
      ([k, v]) => `${k}: ${inferCompactSchema(v, depth - 1)}`,
    )
    const suffix = Object.keys(value).length > 10 ? ', ...' : ''
    return `{${props.join(', ')}${suffix}}`
  }
  return typeof value
}

export async function transformMCPResult(
  result: unknown,
  tool: string, // 用于验证的工具名称（例如 "search"）
  name: string, // 用于转换的服务器名称（例如 "slack"）
): Promise<TransformedMCPResult> {
  if (result && typeof result === 'object') {
    if ('toolResult' in result) {
      return {
        content: String(result.toolResult),
        type: 'toolResult',
      }
    }

    if (
      'structuredContent' in result &&
      result.structuredContent !== undefined
    ) {
      return {
        content: jsonStringify(result.structuredContent),
        type: 'structuredContent',
        schema: inferCompactSchema(result.structuredContent),
      }
    }

    if ('content' in result && Array.isArray(result.content)) {
      const transformedContent = (
        await Promise.all(
          result.content.map(item => transformResultContent(item, name)),
        )
      ).flat()
      return {
        content: transformedContent,
        type: 'contentArray',
        schema: inferCompactSchema(transformedContent),
      }
    }
  }

  const errorMessageText = `MCP 服务器 "${name}" 工具 "${tool}"：响应格式意外`
  logMCPError(name, errorMessageText)
  throw new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
    errorMessageText,
    'MCP 工具响应格式意外',
  )
}

/**
 * 检查 MCP 内容是否包含任何图像块。
 * 用于决定是持久化到文件（图像应使用截断以保持图像压缩和可查看性）。
 */
function contentContainsImages(content: MCPToolResult): boolean {
  if (!content || typeof content === 'string') {
    return false
  }
  return content.some(block => block.type === 'image')
}

export async function processMCPResult(
  result: unknown,
  tool: string, // 用于验证的工具名称（例如 "search"）
  name: string, // 用于 IDE 检查和转换的服务器名称（例如 "slack"）
): Promise<MCPToolResult> {
  const { content, type, schema } = await transformMCPResult(result, tool, name)

  // IDE 工具不直接发送给模型，因此我们不需要处理大型输出。
  if (name === 'ide') {
    return content
  }

  // 检查内容是否需要截断（即是否太大）
  if (!(await mcpContentNeedsTruncation(content))) {
    return content
  }

  const sizeEstimateTokens = getContentSizeEstimate(content)

  // 如果大型输出文件功能被禁用，则回退到旧的截断行为
  if (isEnvDefinedFalsy(process.env.ENABLE_MCP_LARGE_OUTPUT_FILES)) {
    logEvent('tengu_mcp_large_result_handled', {
      outcome: 'truncated',
      reason: 'env_disabled',
      sizeEstimateTokens,
    } as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
    return await truncateMcpContentIfNeeded(content)
  }

  // 将大型输出保存到文件并返回读取指令
  // 此时内容肯定存在（我们已检查过 mcpContentNeedsTruncation）
  if (!content) {
    return content
  }

  // 如果内容包含图像，则回退到截断——将图像持久化为 JSON
  // 会破坏图像压缩逻辑并使其不可查看
  if (contentContainsImages(content)) {
    logEvent('tengu_mcp_large_result_handled', {
      outcome: 'truncated',
      reason: 'contains_images',
      sizeEstimateTokens,
    } as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
    return await truncateMcpContentIfNeeded(content)
  }

  // 为持久化文件生成唯一 ID（服务器__工具-时间戳）
  const timestamp = Date.now()
  const persistId = `mcp-${normalizeNameForMCP(name)}-${normalizeNameForMCP(tool)}-${timestamp}`
  // 转换为字符串以便持久化（persistToolResult 期望字符串或特定的块类型）
  const contentStr =
    typeof content === 'string' ? content : jsonStringify(content, null, 2)
  const persistResult = await persistToolResult(contentStr, persistId)

  if (isPersistError(persistResult)) {
    // 如果文件保存失败，则回退到返回截断的内容信息
    const contentLength = contentStr.length
    logEvent('tengu_mcp_large_result_handled', {
      outcome: 'truncated',
      reason: 'persist_failed',
      sizeEstimateTokens,
    } as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)
    return `错误：结果（${contentLength.toLocaleString()} 个字符）超过了允许的最大令牌数。将输出保存到文件失败：${persistResult.error}。如果此 MCP 服务器提供分页或过滤工具，请使用它们来检索特定部分的数据。`
  }

  logEvent('tengu_mcp_large_result_handled', {
    outcome: 'persisted',
    reason: 'file_saved',
    sizeEstimateTokens,
    persistedSizeChars: persistResult.originalSize,
  } as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS)

  const formatDescription = getFormatDescription(type, schema)
  return getLargeOutputInstructions(
    persistResult.filepath,
    persistResult.originalSize,
    formatDescription,
  )
}

/**
 * 调用 MCP 工具，通过向用户显示 URL 启发并等待完成通知来处理 UrlElicitationRequiredError（-32042），
 * 然后重试工具调用。
 */
type MCPToolCallResult = {
  content: MCPToolResult
  _meta?: Record<string, unknown>
  structuredContent?: Record<string, unknown>
}

/** @internal 为测试导出。 */
export async function callMCPToolWithUrlElicitationRetry({
  client: connectedClient,
  clientConnection,
  tool,
  args,
  meta,
  signal,
  setAppState,
  onProgress,
  callToolFn = callMCPTool,
  handleElicitation,
}: {
  client: ConnectedMCPServer
  clientConnection: MCPServerConnection
  tool: string
  args: Record<string, unknown>
  meta?: Record<string, unknown>
  signal: AbortSignal
  setAppState: (f: (prev: AppState) => AppState) => void
  onProgress?: (data: MCPProgress) => void
  /** 可注入以供测试。默认为 callMCPTool。 */
  callToolFn?: (opts: {
    client: ConnectedMCPServer
    tool: string
    args: Record<string, unknown>
    meta?: Record<string, unknown>
    signal: AbortSignal
    onProgress?: (data: MCPProgress) => void
  }) => Promise<MCPToolCallResult>
  /** 当没有钩子处理 URL 启发时的处理程序。
   * 在 print/SDK 模式下委托给 structuredIO。在 REPL 中回退到队列。 */
  handleElicitation?: (
    serverName: string,
    params: ElicitRequestURLParams,
    signal: AbortSignal,
  ) => Promise<ElicitResult>
}): Promise<MCPToolCallResult> {
  const MAX_URL_ELICITATION_RETRIES = 3
  for (let attempt = 0; ; attempt++) {
    try {
      return await callToolFn({
        client: connectedClient,
        tool,
        args,
        meta,
        signal,
        onProgress,
      })
    } catch (error) {
      // MCP SDK 的 Protocol 为错误响应创建普通的 McpError（而不是 UrlElicitationRequiredError），
      // 因此我们检查错误代码而不是 instanceof。
      if (
        !(error instanceof McpError) ||
        error.code !== ErrorCode.UrlElicitationRequired
      ) {
        throw error
      }

      // 限制 URL 启发重试次数
      if (attempt >= MAX_URL_ELICITATION_RETRIES) {
        throw error
      }

      const errorData = error.data
      const rawElicitations =
        errorData != null &&
        typeof errorData === 'object' &&
        'elicitations' in errorData &&
        Array.isArray(errorData.elicitations)
          ? (errorData.elicitations as unknown[])
          : []

      // 验证每个元素是否具有 ElicitRequestURLParams 所需的字段
      const elicitations = rawElicitations.filter(
        (e): e is ElicitRequestURLParams => {
          if (e == null || typeof e !== 'object') return false
          const obj = e as Record<string, unknown>
          return (
            obj.mode === 'url' &&
            typeof obj.url === 'string' &&
            typeof obj.elicitationId === 'string' &&
            typeof obj.message === 'string'
          )
        },
      )

      const serverName =
        clientConnection.type === 'connected'
          ? clientConnection.name
          : '未知'

      if (elicitations.length === 0) {
        logMCPDebug(
          serverName,
          `工具 '${tool}' 返回 -32042，但错误数据中没有有效的启发`,
        )
        throw error
      }

      logMCPDebug(
        serverName,
        `工具 '${tool}' 需要 URL 启发（错误 -32042，尝试 ${attempt + 1}），正在处理 ${elicitations.length} 个启发`,
      )

      // 处理错误中的每个 URL 启发。
      // 完成通知处理程序（在 registerElicitationHandler 中）在匹配的队列事件上设置 `completed: true`；对话框会对此标志作出反应。
      for (const elicitation of elicitations) {
        const { elicitationId } = elicitation

        // 运行启发钩子 —— 它们可以通过编程方式解决 URL 启发
        const hookResponse = await runElicitationHooks(
          serverName,
          elicitation,
          signal,
        )
        if (hookResponse) {
          logMCPDebug(
            serverName,
            `URL 启发 ${elicitationId} 已由钩子解决：${jsonStringify(hookResponse)}`,
          )
          if (hookResponse.action !== 'accept') {
            return {
              content: `URL 启发被钩子${hookResponse.action === 'decline' ? '拒绝' : hookResponse.action + '取消'}。工具 "${tool}" 无法完成，因为它需要用户打开 URL。`,
            }
          }
          // 钩子接受 —— 跳过 UI 并继续重试
          continue
        }

        // 通过回调（print/SDK 模式）或队列（REPL 模式）解决 URL 启发。
        let userResult: ElicitResult
        if (handleElicitation) {
          // Print/SDK 模式：委托给 structuredIO，后者发送控制请求
          userResult = await handleElicitation(serverName, elicitation, signal)
        } else {
          // REPL 模式：使用两阶段同意/等待流程将启发放入 ElicitationDialog 队列
          const waitingState: ElicitationWaitingState = {
            actionLabel: '立即重试',
            showCancel: true,
          }
          userResult = await new Promise<ElicitResult>(resolve => {
            const onAbort = () => {
              void resolve({ action: 'cancel' })
            }
            if (signal.aborted) {
              onAbort()
              return
            }
            signal.addEventListener('abort', onAbort, { once: true })

            setAppState(prev => ({
              ...prev,
              elicitation: {
                queue: [
                  ...prev.elicitation.queue,
                  {
                    serverName,
                    requestId: `error-elicit-${elicitationId}`,
                    params: elicitation,
                    signal,
                    waitingState,
                    respond: result => {
                      // 第一阶段同意：accept 是无操作（不解决重试 Promise）
                      if (result.action === 'accept') {
                        return
                      }
                      // 拒绝或取消：解决重试 Promise
                      signal.removeEventListener('abort', onAbort)
                      void resolve(result)
                    },
                    onWaitingDismiss: action => {
                      signal.removeEventListener('abort', onAbort)
                      if (action === 'retry') {
                        void resolve({ action: 'accept' })
                      } else {
                        void resolve({ action: 'cancel' })
                      }
                    },
                  },
                ],
              },
            }))
          })
        }

        // 运行启发结果钩子 —— 它们可以修改或阻止响应
        const finalResult = await runElicitationResultHooks(
          serverName,
          userResult,
          signal,
          'url',
          elicitationId,
        )

        if (finalResult.action !== 'accept') {
          logMCPDebug(
            serverName,
            `用户${finalResult.action === 'decline' ? '拒绝' : finalResult.action + '取消'}了 URL 启发 ${elicitationId}`,
          )
          return {
            content: `URL 启发被用户${finalResult.action === 'decline' ? '拒绝' : finalResult.action + '取消'}。工具 "${tool}" 无法完成，因为它需要用户打开 URL。`,
          }
        }

        logMCPDebug(
          serverName,
          `启发 ${elicitationId} 已完成，正在重试工具调用`,
        )
      }

      // 循环回去重试工具调用
    }
  }
}

async function callMCPTool({
  client: { client, name, config },
  tool,
  args,
  meta,
  signal,
  onProgress,
}: {
  client: ConnectedMCPServer
  tool: string
  args: Record<string, unknown>
  meta?: Record<string, unknown>
  signal: AbortSignal
  onProgress?: (data: MCPProgress) => void
}): Promise<{
  content: MCPToolResult
  _meta?: Record<string, unknown>
  structuredContent?: Record<string, unknown>
}> {
  const toolStartTime = Date.now()
  let progressInterval: NodeJS.Timeout | undefined

  try {
    logMCPDebug(name, `正在调用 MCP 工具：${tool}`)

    // 为长时间运行的工具设置进度日志记录（每 30 秒）
    progressInterval = setInterval(
      (startTime, name, tool) => {
        const elapsed = Date.now() - startTime
        const elapsedSeconds = Math.floor(elapsed / 1000)
        const duration = `${elapsedSeconds}秒`
        logMCPDebug(name, `工具 '${tool}' 仍在运行（已过 ${duration}）`)
      },
      30000, // 每 30 秒记录一次
      toolStartTime,
      name,
      tool,
    )

    // 使用 Promise.race 和我们自己的超时来处理 SDK 内部超时不起作用的情况（例如 SSE 流中途中断）
    const timeoutMs = getMcpToolTimeoutMs()
    let timeoutId: NodeJS.Timeout | undefined

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        (reject, name, tool, timeoutMs) => {
          reject(
            new TelemetrySafeError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
              `MCP 服务器 "${name}" 工具 "${tool}" 在 ${Math.floor(timeoutMs / 1000)}秒后超时`,
              'MCP 工具超时',
            ),
          )
        },
        timeoutMs,
        reject,
        name,
        tool,
        timeoutMs,
      )
    })

    const result = await Promise.race([
      client.callTool(
        {
          name: tool,
          arguments: args,
          _meta: meta,
        },
        CallToolResultSchema,
        {
          signal,
          timeout: timeoutMs,
          onprogress: onProgress
            ? sdkProgress => {
                onProgress({
                  type: 'mcp_progress',
                  status: 'progress',
                  serverName: name,
                  toolName: tool,
                  progress: sdkProgress.progress,
                  total: sdkProgress.total,
                  progressMessage: sdkProgress.message,
                })
              }
            : undefined,
        },
      ),
      timeoutPromise,
    ]).finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    })

    if ('isError' in result && result.isError) {
      let errorDetails = '未知错误'
      if (
        'content' in result &&
        Array.isArray(result.content) &&
        result.content.length > 0
      ) {
        const firstContent = result.content[0]
        if (
          firstContent &&
          typeof firstContent === 'object' &&
          'text' in firstContent
        ) {
          errorDetails = firstContent.text
        }
      } else if ('error' in result) {
        // 回退到旧版错误格式
        errorDetails = String(result.error)
      }
      logMCPError(name, errorDetails)
      throw new McpToolCallError_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS(
        errorDetails,
        'MCP 工具返回错误',
        '_meta' in result && result._meta ? { _meta: result._meta } : undefined,
      )
    }
    const elapsed = Date.now() - toolStartTime
    const duration =
      elapsed < 1000
        ? `${elapsed}毫秒`
        : elapsed < 60000
          ? `${Math.floor(elapsed / 1000)}秒`
          : `${Math.floor(elapsed / 60000)}分钟 ${Math.floor((elapsed % 60000) / 1000)}秒`

    logMCPDebug(name, `工具 '${tool}' 在 ${duration} 后成功完成`)

    // 记录代码索引工具使用情况
    const codeIndexingTool = detectCodeIndexingFromMcpServerName(name)
    if (codeIndexingTool) {
      logEvent('tengu_code_indexing_tool_used', {
        tool: codeIndexingTool as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        source:
          'mcp' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        success: true,
      })
    }

    const content = await processMCPResult(result, tool, name)
    return {
      content,
      _meta: result._meta as Record<string, unknown> | undefined,
      structuredContent: result.structuredContent as
        | Record<string, unknown>
        | undefined,
    }
  } catch (e) {
    // 出错时清除间隔
    if (progressInterval !== undefined) {
      clearInterval(progressInterval)
    }

    const elapsed = Date.now() - toolStartTime

    if (e instanceof Error && e.name !== 'AbortError') {
      logMCPDebug(
        name,
        `工具 '${tool}' 在 ${Math.floor(elapsed / 1000)}秒后失败：${e.message}`,
      )
    }

    // 检查表示 OAuth 令牌过期/无效的 401 错误
    // MCP SDK 的 StreamableHTTPError 具有带有 HTTP 状态的 `code` 属性
    if (e instanceof Error) {
      const errorCode = 'code' in e ? (e.code as number | undefined) : undefined
      if (errorCode === 401 || e instanceof UnauthorizedError) {
        logMCPDebug(
          name,
          `工具调用返回 401 未授权 - 令牌可能已过期`,
        )
        logEvent('tengu_mcp_tool_call_auth_error', {})
        throw new McpAuthError(
          name,
          `MCP 服务器 "${name}" 需要重新授权（令牌已过期）`,
        )
      }

      // 检查会话过期 —— 此处可能出现两种错误形式：
      // 1. 直接来自服务器的 404 + JSON-RPC -32001（StreamableHTTPError）
      // 2. -32000“连接已关闭”（McpError）——SDK 在 onerror 处理程序触发后关闭传输，
      //    因此挂起的 callTool() 会因此派生错误而拒绝，而不是原始的 404。
      // 在这两种情况下，清除连接缓存，以便下次工具调用创建新会话。
      const isSessionExpired = isMcpSessionExpiredError(e)
      const isConnectionClosedOnHttp =
        'code' in e &&
        (e as Error & { code?: number }).code === -32000 &&
        e.message.includes('Connection closed') &&
        (config.type === 'http' || config.type === 'claudeai-proxy')
      if (isSessionExpired || isConnectionClosedOnHttp) {
        logMCPDebug(
          name,
          `工具调用期间 MCP 会话过期（${isSessionExpired ? '404/-32001' : '连接已关闭'}），正在清除连接缓存以重新初始化`,
        )
        logEvent('tengu_mcp_session_expired', {})
        await clearServerCache(name, config)
        throw new McpSessionExpiredError(name)
      }
    }

    // 当用户按下 esc 时，避免日志泛滥
    if (!(e instanceof Error) || e.name !== 'AbortError') {
      throw e
    }
    return { content: undefined }
  } finally {
    // 始终清除间隔
    if (progressInterval !== undefined) {
      clearInterval(progressInterval)
    }
  }
}

function extractToolUseId(message: AssistantMessage): string | undefined {
  if (message.message.content[0]?.type !== 'tool_use') {
    return undefined
  }
  return message.message.content[0].id
}

/**
 * 通过创建传输并连接它们来设置 SDK MCP 客户端。
 * 这用于在与 SDK 相同的进程中运行的 SDK MCP 服务器。
 *
 * @param sdkMcpConfigs - SDK MCP 服务器配置
 * @param sendMcpMessage - 通过控制通道发送 MCP 消息的回调
 * @returns 已连接的客户端、它们的工具以及用于消息路由的传输映射
 */
export async function setupSdkMcpClients(
  sdkMcpConfigs: Record<string, McpSdkServerConfig>,
  sendMcpMessage: (
    serverName: string,
    message: JSONRPCMessage,
  ) => Promise<JSONRPCMessage>,
): Promise<{
  clients: MCPServerConnection[]
  tools: Tool[]
}> {
  const clients: MCPServerConnection[] = []
  const tools: Tool[] = []

  // 并行连接到所有服务器
  const results = await Promise.allSettled(
    Object.entries(sdkMcpConfigs).map(async ([name, config]) => {
      const transport = new SdkControlClientTransport(name, sendMcpMessage)

      const client = new Client(
        {
          name: 'claude-code',
          title: 'Claude Code',
          version: MACRO.VERSION ?? 'unknown',
          description: "Anthropic 的智能编程工具",
          websiteUrl: PRODUCT_URL,
        },
        {
          capabilities: {},
        },
      )

      try {
        // 连接客户端
        await client.connect(transport)

        // 从服务器获取能力
        const capabilities = client.getServerCapabilities()

        // 创建已连接的客户端对象
        const connectedClient: MCPServerConnection = {
          type: 'connected',
          name,
          capabilities: capabilities || {},
          client,
          config: { ...config, scope: 'dynamic' as const },
          cleanup: async () => {
            await client.close()
          },
        }

        // 如果服务器有工具，则获取它们
        const serverTools: Tool[] = []
        if (capabilities?.tools) {
          const sdkTools = await fetchToolsForClient(connectedClient)
          serverTools.push(...sdkTools)
        }

        return {
          client: connectedClient,
          tools: serverTools,
        }
      } catch (error) {
        // 如果连接失败，返回失败的服务器
        logMCPError(name, `连接 SDK MCP 服务器失败：${error}`)
        return {
          client: {
            type: 'failed' as const,
            name,
            config: { ...config, scope: 'user' as const },
          },
          tools: [],
        }
      }
    }),
  )

  // 处理结果并收集客户端和工具
  for (const result of results) {
    if (result.status === 'fulfilled') {
      clients.push(result.value.client)
      tools.push(...result.value.tools)
    }
    // 如果被拒绝（意外），错误已在 promise 内部记录
  }

  return { clients, tools }
}
