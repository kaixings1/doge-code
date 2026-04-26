import { type ChildProcess, spawn } from 'child_process'
import { createWriteStream, type WriteStream } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { createInterface } from 'readline'
import { jsonParse, jsonStringify } from '../utils/slowOperations.js'
import { debugTruncate } from './debugUtils.js'
import type {
  SessionActivity,
  SessionDoneStatus,
  SessionHandle,
  SessionSpawner,
  SessionSpawnOpts,
} from './types.js'

const MAX_ACTIVITIES = 10
const MAX_STDERR_LINES = 10

/**
 * 对会话 ID 进行安全处理以便用于文件名。
 * 将任何可能导致路径遍历（如 `../`、`/`）或其他文件系统问题的字符替换为下划线。
 */
export function safeFilenameId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/**
 * 子进程 CLI 在需要权限执行**特定**工具调用（而非一般能力检查）时发出的控制请求。
 * 桥接层将此请求转发至服务端，以便用户批准/拒绝。
 */
export type PermissionRequest = {
  type: 'control_request'
  request_id: string
  request: {
    /** 单次调用的权限检查 —— “我能否使用这些输入运行此工具？” */
    subtype: 'can_use_tool'
    tool_name: string
    input: Record<string, unknown>
    tool_use_id: string
  }
}

type SessionSpawnerDeps = {
  execPath: string
  /**
   * 生成进程时必须在 CLI 标志之前传递的参数。对于编译后的二进制文件（execPath 即为 claude 可执行文件本身），
   * 此数组为空；对于通过 npm 安装的场景（execPath 为 node 运行时），此处包含脚本路径（process.argv[1]）。
   * 缺少此参数会导致 node 将 --sdk-url 视为 node 选项并因“bad option: --sdk-url”退出（见 anthropics/claude-code#28334）。
   */
  scriptArgs: string[]
  env: NodeJS.ProcessEnv
  verbose: boolean
  sandbox: boolean
  debugFile?: string
  permissionMode?: string
  onDebug: (msg: string) => void
  onActivity?: (sessionId: string, activity: SessionActivity) => void
  onPermissionRequest?: (
    sessionId: string,
    request: PermissionRequest,
    accessToken: string,
  ) => void
}

/** 将工具名称映射到人类可读的动词，用于状态显示。 */
const TOOL_VERBS: Record<string, string> = {
  Read: '读取中',
  Write: '写入中',
  Edit: '编辑中',
  MultiEdit: '编辑中',
  Bash: '运行中',
  Glob: '搜索中',
  Grep: '检索中',
  WebFetch: '抓取中',
  WebSearch: '检索中',
  Task: '任务执行中',
  FileReadTool: '读取中',
  FileWriteTool: '写入中',
  FileEditTool: '编辑中',
  GlobTool: '检索中',
  GrepTool: '检索中',
  BashTool: '运行中',
  NotebookEditTool: '编辑笔记本中',
  LSP: 'LSP',
}

function toolSummary(name: string, input: Record<string, unknown>): string {
  const verb = TOOL_VERBS[name] ?? name
  const target =
    (input.file_path as string) ??
    (input.filePath as string) ??
    (input.pattern as string) ??
    (input.command as string | undefined)?.slice(0, 60) ??
    (input.url as string) ??
    (input.query as string) ??
    ''
  if (target) {
    return `${verb} ${target}`
  }
  return verb
}

function extractActivities(
  line: string,
  sessionId: string,
  onDebug: (msg: string) => void,
): SessionActivity[] {
  let parsed: unknown
  try {
    parsed = jsonParse(line)
  } catch {
    return []
  }

  if (!parsed || typeof parsed !== 'object') {
    return []
  }

  const msg = parsed as Record<string, unknown>
  const activities: SessionActivity[] = []
  const now = Date.now()

  switch (msg.type) {
    case 'assistant': {
      const message = msg.message as Record<string, unknown> | undefined
      if (!message) break
      const content = message.content
      if (!Array.isArray(content)) break

      for (const block of content) {
        if (!block || typeof block !== 'object') continue
        const b = block as Record<string, unknown>

        if (b.type === 'tool_use') {
          const name = (b.name as string) ?? 'Tool'
          const input = (b.input as Record<string, unknown>) ?? {}
          const summary = toolSummary(name, input)
          activities.push({
            type: 'tool_start',
            summary,
            timestamp: now,
          })
          onDebug(
            `[bridge:activity] sessionId=${sessionId} 工具调用 name=${name} ${inputPreview(input)}`,
          )
        } else if (b.type === 'text') {
          const text = (b.text as string) ?? ''
          if (text.length > 0) {
            activities.push({
              type: 'text',
              summary: text.slice(0, 80),
              timestamp: now,
            })
            onDebug(
              `[bridge:activity] sessionId=${sessionId} 文本 "${text.slice(0, 100)}"`,
            )
          }
        }
      }
      break
    }
    case 'result': {
      const subtype = msg.subtype as string | undefined
      if (subtype === 'success') {
        activities.push({
          type: 'result',
          summary: '会话已完成',
          timestamp: now,
        })
        onDebug(
          `[bridge:activity] sessionId=${sessionId} 结果 subtype=success`,
        )
      } else if (subtype) {
        const errors = msg.errors as string[] | undefined
        const errorSummary = errors?.[0] ?? `错误: ${subtype}`
        activities.push({
          type: 'error',
          summary: errorSummary,
          timestamp: now,
        })
        onDebug(
          `[bridge:activity] sessionId=${sessionId} 结果 subtype=${subtype} 错误="${errorSummary}"`,
        )
      } else {
        onDebug(
          `[bridge:activity] sessionId=${sessionId} 结果 subtype=undefined`,
        )
      }
      break
    }
    default:
      break
  }

  return activities
}

/**
 * 从重放的 SDKUserMessage NDJSON 行中提取纯文本。如果该消息看起来是真实的人类撰写内容，
 * 则返回修剪后的文本；否则返回 undefined，以便调用方继续等待第一条真实消息。
 */
function extractUserMessageText(
  msg: Record<string, unknown>,
): string | undefined {
  // 跳过工具结果类用户消息（包装的子代理结果）以及合成的注意事项消息 —— 均非人类撰写。
  if (msg.parent_tool_use_id != null || msg.isSynthetic || msg.isReplay)
    return undefined

  const message = msg.message as Record<string, unknown> | undefined
  const content = message?.content
  let text: string | undefined
  if (typeof content === 'string') {
    text = content
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (
        block &&
        typeof block === 'object' &&
        (block as Record<string, unknown>).type === 'text'
      ) {
        text = (block as Record<string, unknown>).text as string | undefined
        break
      }
    }
  }
  text = text?.trim()
  return text ? text : undefined
}

/** 构建工具输入预览的简短字符串，用于调试日志。 */
function inputPreview(input: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, val] of Object.entries(input)) {
    if (typeof val === 'string') {
      parts.push(`${key}="${val.slice(0, 100)}"`)
    }
    if (parts.length >= 3) break
  }
  return parts.join(' ')
}

export function createSessionSpawner(deps: SessionSpawnerDeps): SessionSpawner {
  return {
    spawn(opts: SessionSpawnOpts, dir: string): SessionHandle {
      // 调试文件解析：
      // 1. 若提供了 deps.debugFile，则在其后追加会话 ID 后缀以确保唯一性
      // 2. 若 verbose 或 ant 构建，则自动生成临时文件路径
      // 3. 否则，不生成调试文件
      const safeId = safeFilenameId(opts.sessionId)
      let debugFile: string | undefined
      if (deps.debugFile) {
        const ext = deps.debugFile.lastIndexOf('.')
        if (ext > 0) {
          debugFile = `${deps.debugFile.slice(0, ext)}-${safeId}${deps.debugFile.slice(ext)}`
        } else {
          debugFile = `${deps.debugFile}-${safeId}`
        }
      } else if (deps.verbose || process.env.USER_TYPE === 'ant') {
        debugFile = join(tmpdir(), 'claude', `bridge-session-${safeId}.log`)
      }

      // 转录文件：写入原始 NDJSON 行以供事后分析。
      // 若配置了调试文件，则将其放置于调试文件旁。
      let transcriptStream: WriteStream | null = null
      let transcriptPath: string | undefined
      if (deps.debugFile) {
        transcriptPath = join(
          dirname(deps.debugFile),
          `bridge-transcript-${safeId}.jsonl`,
        )
        transcriptStream = createWriteStream(transcriptPath, { flags: 'a' })
        transcriptStream.on('error', err => {
          deps.onDebug(
            `[bridge:session] 转录文件写入错误: ${err.message}`,
          )
          transcriptStream = null
        })
        deps.onDebug(`[bridge:session] 转录日志: ${transcriptPath}`)
      }

      const args = [
        ...deps.scriptArgs,
        '--print',
        '--sdk-url',
        opts.sdkUrl,
        '--session-id',
        opts.sessionId,
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--replay-user-messages',
        ...(deps.verbose ? ['--verbose'] : []),
        ...(debugFile ? ['--debug-file', debugFile] : []),
        ...(deps.permissionMode
          ? ['--permission-mode', deps.permissionMode]
          : []),
      ]

      const env: NodeJS.ProcessEnv = {
        ...deps.env,
        // 移除桥接层自身的 OAuth 令牌，以便子进程使用会话访问令牌进行推理。
        CLAUDE_CODE_OAUTH_TOKEN: undefined,
        CLAUDE_CODE_ENVIRONMENT_KIND: 'bridge',
        ...(deps.sandbox && { CLAUDE_CODE_FORCE_SANDBOX: '1' }),
        CLAUDE_CODE_SESSION_ACCESS_TOKEN: opts.accessToken,
        // v1: HybridTransport（WebSocket 读取 + POST 写入）至 Session-Ingress。
        // 在 v2 模式下无害 —— transportUtils 会先检查 CLAUDE_CODE_USE_CCR_V2。
        CLAUDE_CODE_POST_FOR_SESSION_INGRESS_V2: '1',
        // v2: SSETransport + CCRClient 至 CCR 的 /v1/code/sessions/* 端点。
        // 与容器路径中 environment-manager 设置的环境变量相同。
        ...(opts.useCcrV2 && {
          CLAUDE_CODE_USE_CCR_V2: '1',
          CLAUDE_CODE_WORKER_EPOCH: String(opts.workerEpoch),
        }),
      }

      deps.onDebug(
        `[bridge:session] 正在生成会话 sessionId=${opts.sessionId} sdkUrl=${opts.sdkUrl} accessToken=${opts.accessToken ? '存在' : '缺失'}`,
      )
      deps.onDebug(`[bridge:session] 子进程参数: ${args.join(' ')}`)
      if (debugFile) {
        deps.onDebug(`[bridge:session] 调试日志: ${debugFile}`)
      }

      // 同时管道三个流：stdin 用于控制，stdout 用于 NDJSON 解析，stderr 用于错误捕获和诊断。
      const child: ChildProcess = spawn(deps.execPath, args, {
        cwd: dir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        windowsHide: true,
      })

      deps.onDebug(
        `[bridge:session] sessionId=${opts.sessionId} pid=${child.pid}`,
      )

      const activities: SessionActivity[] = []
      let currentActivity: SessionActivity | null = null
      const lastStderr: string[] = []
      let sigkillSent = false
      let firstUserMessageSeen = false

      // 缓冲 stderr 用于错误诊断
      if (child.stderr) {
        const stderrRl = createInterface({ input: child.stderr })
        stderrRl.on('line', line => {
          // 在 verbose 模式下将 stderr 转发至桥接层的 stderr
          if (deps.verbose) {
            process.stderr.write(line + '\n')
          }
          // 环形缓冲区，保留最后 N 行
          if (lastStderr.length >= MAX_STDERR_LINES) {
            lastStderr.shift()
          }
          lastStderr.push(line)
        })
      }

      // 从子进程 stdout 解析 NDJSON
      if (child.stdout) {
        const rl = createInterface({ input: child.stdout })
        rl.on('line', line => {
          // 将原始 NDJSON 写入转录文件
          if (transcriptStream) {
            transcriptStream.write(line + '\n')
          }

          // 记录从子进程 CLI 流向桥接层的所有消息
          deps.onDebug(
            `[bridge:ws] sessionId=${opts.sessionId} <<< ${debugTruncate(line)}`,
          )

          // 在 verbose 模式下，将原始输出转发至 stderr
          if (deps.verbose) {
            process.stderr.write(line + '\n')
          }

          const extracted = extractActivities(
            line,
            opts.sessionId,
            deps.onDebug,
          )
          for (const activity of extracted) {
            // 维护环形缓冲区
            if (activities.length >= MAX_ACTIVITIES) {
              activities.shift()
            }
            activities.push(activity)
            currentActivity = activity

            deps.onActivity?.(opts.sessionId, activity)
          }

          // 检测控制请求及重放的用户消息。
          // extractActivities 会解析同一行，但会吞掉解析错误并跳过 'user' 类型 —— 此处重新解析开销很小（NDJSON 行很短），
          // 且使每条路径自包含。
          {
            let parsed: unknown
            try {
              parsed = jsonParse(line)
            } catch {
              // 非 JSON 行，跳过检测
            }
            if (parsed && typeof parsed === 'object') {
              const msg = parsed as Record<string, unknown>

              if (msg.type === 'control_request') {
                const request = msg.request as
                  | Record<string, unknown>
                  | undefined
                if (
                  request?.subtype === 'can_use_tool' &&
                  deps.onPermissionRequest
                ) {
                  deps.onPermissionRequest(
                    opts.sessionId,
                    parsed as PermissionRequest,
                    opts.accessToken,
                  )
                }
                // interrupt 是轮次级别的；子进程内部处理（print.ts）
              } else if (
                msg.type === 'user' &&
                !firstUserMessageSeen &&
                opts.onFirstUserMessage
              ) {
                const text = extractUserMessageText(msg)
                if (text) {
                  firstUserMessageSeen = true
                  opts.onFirstUserMessage(text)
                }
              }
            }
          }
        })
      }

      const done = new Promise<SessionDoneStatus>(resolve => {
        child.on('close', (code, signal) => {
          // 退出时关闭转录流
          if (transcriptStream) {
            transcriptStream.end()
            transcriptStream = null
          }

          if (signal === 'SIGTERM' || signal === 'SIGINT') {
            deps.onDebug(
              `[bridge:session] sessionId=${opts.sessionId} 被中断 signal=${signal} pid=${child.pid}`,
            )
            resolve('interrupted')
          } else if (code === 0) {
            deps.onDebug(
              `[bridge:session] sessionId=${opts.sessionId} 完成 exit_code=0 pid=${child.pid}`,
            )
            resolve('completed')
          } else {
            deps.onDebug(
              `[bridge:session] sessionId=${opts.sessionId} 失败 exit_code=${code} pid=${child.pid}`,
            )
            resolve('failed')
          }
        })

        child.on('error', err => {
          deps.onDebug(
            `[bridge:session] sessionId=${opts.sessionId} 生成错误: ${err.message}`,
          )
          resolve('failed')
        })
      })

      const handle: SessionHandle = {
        sessionId: opts.sessionId,
        done,
        activities,
        accessToken: opts.accessToken,
        lastStderr,
        get currentActivity(): SessionActivity | null {
          return currentActivity
        },
        kill(): void {
          if (!child.killed) {
            deps.onDebug(
              `[bridge:session] 向 sessionId=${opts.sessionId} 发送 SIGTERM pid=${child.pid}`,
            )
            // 在 Windows 上，child.kill('SIGTERM') 会抛出异常；使用默认信号。
            if (process.platform === 'win32') {
              child.kill()
            } else {
              child.kill('SIGTERM')
            }
          }
        },
        forceKill(): void {
          // 使用独立的标志，因为 child.killed 在调用 kill() 时即被设置，而非进程退出时。
          // 即使在 SIGTERM 之后，仍需发送 SIGKILL。
          if (!sigkillSent && child.pid) {
            sigkillSent = true
            deps.onDebug(
              `[bridge:session] 向 sessionId=${opts.sessionId} 发送 SIGKILL pid=${child.pid}`,
            )
            if (process.platform === 'win32') {
              child.kill()
            } else {
              child.kill('SIGKILL')
            }
          }
        },
        writeStdin(data: string): void {
          if (child.stdin && !child.stdin.destroyed) {
            deps.onDebug(
              `[bridge:ws] sessionId=${opts.sessionId} >>> ${debugTruncate(data)}`,
            )
            child.stdin.write(data)
          }
        },
        updateAccessToken(token: string): void {
          handle.accessToken = token
          // 通过 stdin 将新令牌发送至子进程。子进程的 StructuredIO 处理 update_environment_variables 消息，
          // 直接设置 process.env，因此在下一次 refreshHeaders 调用时 getSessionIngressAuthToken() 会获取到新令牌。
          handle.writeStdin(
            jsonStringify({
              type: 'update_environment_variables',
              variables: { CLAUDE_CODE_SESSION_ACCESS_TOKEN: token },
            }) + '\n',
          )
          deps.onDebug(
            `[bridge:session] 已通过 stdin 为 sessionId=${opts.sessionId} 发送令牌刷新`,
          )
        },
      }

      return handle
    },
  }
}

export { extractActivities as _extractActivitiesForTesting }