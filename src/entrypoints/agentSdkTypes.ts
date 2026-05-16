/**
 * Claude Code Agent SDK 类型的主入口点。
 *
 * 此文件重新导出公共 SDK API，来源包括：
 * - sdk/coreTypes.ts - 公共可序列化类型（消息、配置）
 * - sdk/runtimeTypes.ts - 不可序列化类型（回调、接口）
 *
 * 需要控制协议类型的 SDK 构建者应直接
 * 从 sdk/controlTypes.ts 导入。
 */

import type {
  CallToolResult,
  ToolAnnotations,
} from '@modelcontextprotocol/sdk/types.js'

// SDK 构建者的控制协议类型（桥接子路径消费者）
/** @alpha */
export type {
  SDKControlRequest,
  SDKControlResponse,
} from './sdk/controlTypes.js'
// 重新导出核心类型（公共可序列化类型）
export * from './sdk/coreTypes.js'
// 重新导出运行时类型（回调、带方法的接口）
export * from './sdk/runtimeTypes.js'

// 重新导出设置类型（从设置 JSON schema 生成）
export type { Settings } from './sdk/settingsTypes.generated.js'
// 重新导出工具类型（在 SDK API 稳定之前全部标记为 @internal）
export * from './sdk/toolTypes.js'

// ============================================================================
// 函数
// ============================================================================

import type {
  SDKMessage,
  SDKResultMessage,
  SDKSessionInfo,
  SDKUserMessage,
} from './sdk/coreTypes.js'
// 导入函数签名所需的类型
import type {
  AnyZodRawShape,
  ForkSessionOptions,
  ForkSessionResult,
  GetSessionInfoOptions,
  GetSessionMessagesOptions,
  InferShape,
  InternalOptions,
  InternalQuery,
  ListSessionsOptions,
  McpSdkServerConfigWithInstance,
  Options,
  Query,
  SDKSession,
  SDKSessionOptions,
  SdkMcpToolDefinition,
  SessionMessage,
  SessionMutationOptions,
} from './sdk/runtimeTypes.js'

export type {
  ListSessionsOptions,
  GetSessionInfoOptions,
  SessionMutationOptions,
  ForkSessionOptions,
  ForkSessionResult,
  SDKSessionInfo,
}

export function tool<Schema extends AnyZodRawShape>(
  _name: string,
  _description: string,
  _inputSchema: Schema,
  _handler: (
    args: InferShape<Schema>,
    extra: unknown,
  ) => Promise<CallToolResult>,
  _extras?: {
    annotations?: ToolAnnotations
    searchHint?: string
    alwaysLoad?: boolean
  },
): SdkMcpToolDefinition<Schema> {
  throw new Error('not implemented')
}

type CreateSdkMcpServerOptions = {
  name: string
  version?: string

  tools?: Array<SdkMcpToolDefinition<any>>
}

/**
 * 创建一个可与 SDK 传输一起使用的 MCP 服务器实例。
 * 这允许 SDK 用户定义在同一进程中运行的自定义工具。
 *
 * 如果您的 SDK MCP 调用运行时间超过 60 秒，请覆盖 CLAUDE_CODE_STREAM_CLOSE_TIMEOUT
 */
export function createSdkMcpServer(
  _options: CreateSdkMcpServerOptions,
): McpSdkServerConfigWithInstance {
  throw new Error('not implemented')
}

export class AbortError extends Error {}

/** @internal */
export function query(_params: {
  prompt: string | AsyncIterable<SDKUserMessage>
  options?: InternalOptions
}): InternalQuery
export function query(_params: {
  prompt: string | AsyncIterable<SDKUserMessage>
  options?: Options
}): Query
export function query(): Query {
  throw new Error('query is not implemented in the SDK')
}

/**
 * V2 API - UNSTABLE
 * 创建用于多轮对话的持久会话。
 * @alpha
 */
export function unstable_v2_createSession(
  _options: SDKSessionOptions,
): SDKSession {
  throw new Error('unstable_v2_createSession is not implemented in the SDK')
}

/**
 * V2 API - UNSTABLE
 * 通过 ID 恢复现有会话。
 * @alpha
 */
export function unstable_v2_resumeSession(
  _sessionId: string,
  _options: SDKSessionOptions,
): SDKSession {
  throw new Error('unstable_v2_resumeSession is not implemented in the SDK')
}

// @[MODEL LAUNCH]: 更新此文档字符串中的示例模型 ID。
/**
 * V2 API - UNSTABLE
 * 用于单次提示的一次性便捷函数。
 * @alpha
 *
 * @example
 * ```typescript
 * const result = await unstable_v2_prompt("What files are here?", {
 *   model: 'claude-sonnet-4-6'
 * })
 * ```
 */
export async function unstable_v2_prompt(
  _message: string,
  _options: SDKSessionOptions,
): Promise<SDKResultMessage> {
  throw new Error('unstable_v2_prompt is not implemented in the SDK')
}

/**
 * 从会话的 JSONL 转录文件中读取对话消息。
 *
 * 解析转录文件，通过 parentUuid 链接构建对话链，
 * 并按时间顺序返回用户/助手消息。设置
 * `includeSystemMessages: true` 选项以同时包含系统消息。
 *
 * @param sessionId - 要读取的会话 UUID
 * @param options - 可选的 dir、limit、offset 和 includeSystemMessages
 * @returns 消息数组，如果会话未找到则返回空数组
 */
export async function getSessionMessages(
  _sessionId: string,
  _options?: GetSessionMessagesOptions,
): Promise<SessionMessage[]> {
  throw new Error('getSessionMessages is not implemented in the SDK')
}

/**
 * 列出会话及其元数据。
 *
 * 当提供 `dir` 时，返回该项目目录及其 git worktrees 的会话。
 * 省略时，返回所有项目中的会话。
 *
 * 使用 `limit` 和 `offset` 进行分页。
 *
 * @example
 * ```typescript
 * // 列出特定项目的会话
 * const sessions = await listSessions({ dir: '/path/to/project' })
 *
 * // 分页
 * const page1 = await listSessions({ limit: 50 })
 * const page2 = await listSessions({ limit: 50, offset: 50 })
 * ```
 */
export async function listSessions(
  _options?: ListSessionsOptions,
): Promise<SDKSessionInfo[]> {
  throw new Error('listSessions is not implemented in the SDK')
}

/**
 * 通过 ID 读取单个会话的元数据。与 `listSessions` 不同，此函数仅
 * 读取单个会话文件，而非项目中每个会话。
 * 如果未找到会话文件、是侧链会话或没有可提取的摘要，则返回 undefined。
 *
 * @param sessionId - 会话的 UUID
 * @param options - `{ dir?: string }` 项目路径；省略则搜索所有项目目录
 */
export async function getSessionInfo(
  _sessionId: string,
  _options?: GetSessionInfoOptions,
): Promise<SDKSessionInfo | undefined> {
  throw new Error('getSessionInfo is not implemented in the SDK')
}

/**
 * 重命名会话。向会话的 JSONL 文件追加自定义标题条目。
 * @param sessionId - 会话的 UUID
 * @param title - 新标题
 * @param options - `{ dir?: string }` 项目路径；省略则搜索所有项目
 */
export async function renameSession(
  _sessionId: string,
  _title: string,
  _options?: SessionMutationOptions,
): Promise<void> {
  throw new Error('renameSession is not implemented in the SDK')
}

/**
 * 标记会话。传递 null 以清除标记。
 * @param sessionId - 会话的 UUID
 * @param tag - 标记字符串，或 null 以清除
 * @param options - `{ dir?: string }` 项目路径；省略则搜索所有项目
 */
export async function tagSession(
  _sessionId: string,
  _tag: string | null,
  _options?: SessionMutationOptions,
): Promise<void> {
  throw new Error('tagSession is not implemented in the SDK')
}

/**
 * 将会话分叉到具有新 UUID 的新分支。
 *
 * 将源会话中的转录消息复制到新会话文件中，
 * 重新映射每个消息 UUID 并保留 parentUuid 链。支持
 * `upToMessageId` 从对话中的特定点进行分支。
 *
 * 分叉的会话不会带有撤销历史（文件历史快照不会被复制）。
 *
 * @param sessionId - 源会话的 UUID
 * @param options - `{ dir?, upToMessageId?, title? }`
 * @returns `{ sessionId }` — 新分叉会话的 UUID
 */
export async function forkSession(
  _sessionId: string,
  _options?: ForkSessionOptions,
): Promise<ForkSessionResult> {
  throw new Error('forkSession is not implemented in the SDK')
}

// ============================================================================
// 助手守护进程原语（内部）
// ============================================================================

/**
 * 来自 `<dir>/.claude/scheduled_tasks.json` 的定时任务。
 * @internal
 */
export type CronTask = {
  id: string
  cron: string
  prompt: string
  createdAt: number
  recurring?: boolean
}

/**
 * Cron 调度器调节旋钮（抖动 + 过期）。在 CLI 会话中从
 * `tengu_kairos_cron_config` GrowthBook 配置在运行时获取；守护进程宿主
 * 通过 `watchScheduledTasks({ getJitterConfig })` 传递此配置以获得
 * 相同的调节。
 * @internal
 */
export type CronJitterConfig = {
  recurringFrac: number
  recurringCapMs: number
  oneShotMaxMs: number
  oneShotFloorMs: number
  oneShotMinuteMod: number
  recurringMaxAgeMs: number
}

/**
 * 由 `watchScheduledTasks()` 产生的事件。
 * @internal
 */
export type ScheduledTaskEvent =
  | { type: 'fire'; task: CronTask }
  | { type: 'missed'; tasks: CronTask[] }

/**
 * 由 `watchScheduledTasks()` 返回的句柄。
 * @internal
 */
export type ScheduledTasksHandle = {
  /** fire/missed 事件的异步流。通过 `for await` 消费。 */
  events(): AsyncGenerator<ScheduledTaskEvent>
  /**
   * 所有加载任务中最早计划触发的时间（纪元毫秒），如果没有任何计划
   * 则返回 null。用于决定是拆除空闲代理子进程还是
   * 为即将到来的触发保持其活跃。
   */
  getNextFireTime(): number | null
}

/**
 * 监视 `<dir>/.claude/scheduled_tasks.json` 并在任务触发时产生事件。
 *
 * 获取每个目录的调度器锁（基于 PID 的活性检查），因此同一目录中的 REPL
 * 会话不会重复触发。当信号中止时释放锁并关闭文件监视器。
 *
 * - `fire` — 其 cron 调度已满足的任务。一次性任务在此事件产生时
 *   已从文件中删除；重复性任务被重新调度（或如果过期则被删除）。
 * - `missed` — 守护进程关闭期间其窗口已过的一次性任务。
 *   在初始加载时产生一次；后台删除操作会稍后将其从文件中移除。
 *
 * 适用于外部拥有调度器的守护进程架构，并通过 `query()` 生成代理；
 * 代理子进程（`-p` 模式）不运行自己的调度器。
 *
 * @internal
 */
export function watchScheduledTasks(_opts: {
  dir: string
  signal: AbortSignal
  getJitterConfig?: () => CronJitterConfig
}): ScheduledTasksHandle {
  throw new Error('not implemented')
}

/**
 * 将错过的一次性任务格式化为提示，要求模型在执行前
 * 与用户确认（通过 AskUserQuestion）。
 * @internal
 */
export function buildMissedTaskNotification(_missed: CronTask[]): string {
  throw new Error('not implemented')
}

/**
 * 在 claude.ai 上键入的用户消息，从桥接 WebSocket 中提取。
 * @internal
 */
export type InboundPrompt = {
  content: string | unknown[]
  uuid?: string
}

/**
 * connectRemoteControl 的选项。
 * @internal
 */
export type ConnectRemoteControlOptions = {
  dir: string
  name?: string
  workerType?: string
  branch?: string
  gitRepoUrl?: string | null
  getAccessToken: () => string | undefined
  baseUrl: string
  orgUUID: string
  model: string
}

/**
 * 由 connectRemoteControl 返回的句柄。将 query() 的产出写入，
 * 读取入站提示。有关完整的字段文档，请参阅 src/assistant/daemonBridge.ts。
 * @internal
 */
export type RemoteControlHandle = {
  sessionUrl: string
  environmentId: string
  bridgeSessionId: string
  write(msg: SDKMessage): void
  sendResult(): void
  sendControlRequest(req: unknown): void
  sendControlResponse(res: unknown): void
  sendControlCancelRequest(requestId: string): void
  inboundPrompts(): AsyncGenerator<InboundPrompt>
  controlRequests(): AsyncGenerator<unknown>
  permissionResponses(): AsyncGenerator<unknown>
  onStateChange(
    cb: (
      state: 'ready' | 'connected' | 'reconnecting' | 'failed',
      detail?: string,
    ) => void,
  ): void
  teardown(): Promise<void>
}

/**
 * 从守护进程持有 claude.ai 远程控制桥接连接。
 *
 * 守护进程在父进程中拥有 WebSocket — 如果代理子进程
 *（通过 `query()` 生成）崩溃，守护进程会重新生成它，而
 * claude.ai 保持同一会话。与 `query.enableRemoteControl` 形成对比，
 * 后者将 WebSocket 放在子进程中（随代理一起消亡）。
 *
 * 通过 `write()` + `sendResult()` 管道传输 `query()` 的产出。将
 * `inboundPrompts()`（用户在 claude.ai 上键入的内容）读入 `query()` 的输入流。
 * 在本地处理 `controlRequests()`（中断 → 中止，set_model → 重新配置）。
 *
 * 跳过 `tengu_ccr_bridge` 门控和策略限制检查 — @internal
 * 调用者已预先获得授权。仍然需要 OAuth（环境变量或密钥链）。
 *
 * 如果没有 OAuth 或注册失败，则返回 null。
 *
 * @internal
 */
export async function connectRemoteControl(
  _opts: ConnectRemoteControlOptions,
): Promise<RemoteControlHandle | null> {
  throw new Error('not implemented')
}
