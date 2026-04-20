import axios, { type AxiosError } from 'axios'
import type { UUID } from 'crypto'
import { getOauthConfig } from '../../constants/oauth.js'
import type { Entry, TranscriptMessage } from '../../types/logs.js'
import { logForDebugging } from '../../utils/debug.js'
import { logForDiagnosticsNoPII } from '../../utils/diagLogs.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { logError } from '../../utils/log.js'
import { sequential } from '../../utils/sequential.js'
import { getSessionIngressAuthToken } from '../../utils/sessionIngressAuth.js'
import { sleep } from '../../utils/sleep.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { getOAuthHeaders } from '../../utils/teleport/api.js'

interface SessionIngressError {
  error?: {
    message?: string
    type?: string
  }
}

// 模块级状态
const lastUuidMap: Map<string, UUID> = new Map()

const MAX_RETRIES = 10
const BASE_DELAY_MS = 500

// 每个会话的顺序包装器，防止并发写入日志
const sequentialAppendBySession: Map<
  string,
  (
    entry: TranscriptMessage,
    url: string,
    headers: Record<string, string>,
  ) => Promise<boolean>
> = new Map()

/**
 * 获取或创建会话的顺序包装器
 * 确保同一会话的日志追加操作按顺序处理，避免竞态条件
 */
function getOrCreateSequentialAppend(sessionId: string) {
  let sequentialAppend = sequentialAppendBySession.get(sessionId)
  if (!sequentialAppend) {
    sequentialAppend = sequential(
      async (
        entry: TranscriptMessage,
        url: string,
        headers: Record<string, string>,
      ) => await appendSessionLogImpl(sessionId, entry, url, headers),
    )
    sequentialAppendBySession.set(sessionId, sequentialAppend)
  }
  return sequentialAppend
}

/**
 * 内部实现：带重试逻辑的会话日志追加
 * 临时错误（网络问题、5xx、429）会重试。遇到 409 则采用服务端最新 UUID 后重试
 * （处理已终止进程中未完成请求造成的陈旧状态）。遇到 401 立即失败。
 */
async function appendSessionLogImpl(
  sessionId: string,
  entry: TranscriptMessage,
  url: string,
  headers: Record<string, string>,
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const lastUuid = lastUuidMap.get(sessionId)
      const requestHeaders = { ...headers }
      if (lastUuid) {
        requestHeaders['Last-Uuid'] = lastUuid
      }

      const response = await axios.put(url, entry, {
        headers: requestHeaders,
        validateStatus: status => status < 500,
      })

      if (response.status === 200 || response.status === 201) {
        lastUuidMap.set(sessionId, entry.uuid)
        logForDebugging(`会话日志成功写入 session ${sessionId}`)
        return true
      }

      if (response.status === 409) {
        // 检查条目是否实际已存储（服务端返回 409 但条目已存在）
        // 处理条目已存储但客户端收到错误响应导致 lastUuidMap 陈旧的情况
        const serverLastUuid = response.headers['x-last-uuid']
        if (serverLastUuid === entry.uuid) {
          // 该条目已是服务端最新条目——之前已成功存储
          lastUuidMap.set(sessionId, entry.uuid)
          logForDebugging(
            `会话条目 ${entry.uuid} 已存在于服务端，从陈旧状态中恢复`,
          )
          logForDiagnosticsNoPII('info', 'session_persist_recovered_from_409')
          return true
        }

        // 其他写入方（如已终止进程的进行中请求）推进了服务端链。
        // 尝试从响应头获取服务端最新 UUID，或重新拉取会话以获取。
        if (serverLastUuid) {
          lastUuidMap.set(sessionId, serverLastUuid as UUID)
          logForDebugging(
            `会话 409：采用响应头中的服务端 lastUuid=${serverLastUuid}，重试条目 ${entry.uuid}`,
          )
        } else {
          // 服务端未返回 x-last-uuid（如 v1 端点）。重新拉取会话以获取追加链的头部。
          const logs = await fetchSessionLogsFromUrl(sessionId, url, headers)
          const adoptedUuid = findLastUuid(logs)
          if (adoptedUuid) {
            lastUuidMap.set(sessionId, adoptedUuid)
            logForDebugging(
              `会话 409：重新获取 ${logs!.length} 条记录，采用 lastUuid=${adoptedUuid}，重试条目 ${entry.uuid}`,
            )
          } else {
            // 无法确定服务端状态——放弃
            const errorData = response.data as SessionIngressError
            const errorMessage = errorData.error?.message || '检测到并发修改'
            logError(
              new Error(
                `会话持久化冲突：会话 ${sessionId} 的 UUID 不匹配，条目 ${entry.uuid}。${errorMessage}`,
              ),
            )
            logForDiagnosticsNoPII(
              'error',
              'session_persist_fail_concurrent_modification',
            )
            return false
          }
        }
        logForDiagnosticsNoPII('info', 'session_persist_409_adopt_server_uuid')
        continue // 使用更新后的 lastUuid 重试
      }

      if (response.status === 401) {
        logForDebugging('会话令牌已过期或无效')
        logForDiagnosticsNoPII('error', 'session_persist_fail_bad_token')
        return false // 不可重试
      }

      // 其他 4xx（如 429）——可重试
      logForDebugging(
        `持久化会话日志失败: ${response.status} ${response.statusText}`,
      )
      logForDiagnosticsNoPII('error', 'session_persist_fail_status', {
        status: response.status,
        attempt,
      })
    } catch (error) {
      // 网络错误、5xx——可重试
      const axiosError = error as AxiosError<SessionIngressError>
      logError(new Error(`持久化会话日志出错: ${axiosError.message}`))
      logForDiagnosticsNoPII('error', 'session_persist_fail_status', {
        status: axiosError.status,
        attempt,
      })
    }

    if (attempt === MAX_RETRIES) {
      logForDebugging(`远程持久化失败，已重试 ${MAX_RETRIES} 次`)
      logForDiagnosticsNoPII(
        'error',
        'session_persist_error_retries_exhausted',
        { attempt },
      )
      return false
    }

    const delayMs = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), 8000)
    logForDebugging(
      `远程持久化第 ${attempt}/${MAX_RETRIES} 次尝试失败，${delayMs}ms 后重试…`,
    )
    await sleep(delayMs)
  }

  return false
}

/**
 * 使用 JWT 令牌向会话追加日志条目
 * 通过 Last-Uuid 头实现乐观并发控制
 * 每个会话确保顺序执行，防止竞态条件
 */
export async function appendSessionLog(
  sessionId: string,
  entry: TranscriptMessage,
  url: string,
): Promise<boolean> {
  const sessionToken = getSessionIngressAuthToken()
  if (!sessionToken) {
    logForDebugging('无可用的会话令牌用于会话持久化')
    logForDiagnosticsNoPII('error', 'session_persist_fail_jwt_no_token')
    return false
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${sessionToken}`,
    'Content-Type': 'application/json',
  }

  const sequentialAppend = getOrCreateSequentialAppend(sessionId)
  return sequentialAppend(entry, url, headers)
}

/**
 * 获取所有会话日志用于水合
 */
export async function getSessionLogs(
  sessionId: string,
  url: string,
): Promise<Entry[] | null> {
  const sessionToken = getSessionIngressAuthToken()
  if (!sessionToken) {
    logForDebugging('无可用的会话令牌用于获取会话日志')
    logForDiagnosticsNoPII('error', 'session_get_fail_no_token')
    return null
  }

  const headers = { Authorization: `Bearer ${sessionToken}` }
  const logs = await fetchSessionLogsFromUrl(sessionId, url, headers)

  if (logs && logs.length > 0) {
    // 将 lastUuid 更新为最后一条条目的 UUID
    const lastEntry = logs.at(-1)
    if (lastEntry && 'uuid' in lastEntry && lastEntry.uuid) {
      lastUuidMap.set(sessionId, lastEntry.uuid)
    }
  }

  return logs
}

/**
 * 通过 OAuth 获取所有会话日志用于水合
 * 用于从 Sessions API 传送会话
 */
export async function getSessionLogsViaOAuth(
  sessionId: string,
  accessToken: string,
  orgUUID: string,
): Promise<Entry[] | null> {
  const url = `${getOauthConfig().BASE_API_URL}/v1/session_ingress/session/${sessionId}`
  logForDebugging(`[session-ingress] 正在从以下地址获取会话日志: ${url}`)
  const headers = {
    ...getOAuthHeaders(accessToken),
    'x-organization-uuid': orgUUID,
  }
  const result = await fetchSessionLogsFromUrl(sessionId, url, headers)
  return result
}

/**
 * GET /v1/code/sessions/{id}/teleport-events 的响应结构。
 * WorkerEvent.payload 即为 Entry（TranscriptMessage 结构体）—— CLI
 * 通过 AddWorkerEvent 写入，服务端以不透明形式存储，此处读取。
 */
type TeleportEventsResponse = {
  data: Array<{
    event_id: string
    event_type: string
    is_compaction: boolean
    payload: Entry | null
    created_at: string
  }>
  // 无更多分页时此字段未设置——这即是流结束信号（无单独的 has_more 字段）。
  next_cursor?: string
}

/**
 * 通过 CCR v2 Sessions API 获取 worker 事件（转录记录）。
 * 待 session-ingress 退役后，此函数将替代 getSessionLogsViaOAuth。
 *
 * 服务端按会话分发：v2 原生会话走 Spanner，pre-backfill 的 session_* ID 走 threadstore。
 * 游标对我们不透明——持续回传直至 next_cursor 未设置。
 *
 * 分页（默认 500/页，服务端最大 1000）。session-ingress 的一次性 50k 限制已弃用；改为循环拉取。
 */
export async function getTeleportEvents(
  sessionId: string,
  accessToken: string,
  orgUUID: string,
): Promise<Entry[] | null> {
  const baseUrl = `${getOauthConfig().BASE_API_URL}/v1/code/sessions/${sessionId}/teleport-events`
  const headers = {
    ...getOAuthHeaders(accessToken),
    'x-organization-uuid': orgUUID,
  }

  logForDebugging(`[teleport] 从 ${baseUrl} 获取事件`)

  const all: Entry[] = []
  let cursor: string | undefined
  let pages = 0

  // 无限循环保护：1000/页 × 100 页 = 10 万事件。超过 session-ingress 的 5 万单次限制。
  // 若触发此上限，说明服务端游标未推进——应退出而非挂起。
  const maxPages = 100

  while (pages < maxPages) {
    const params: Record<string, string | number> = { limit: 1000 }
    if (cursor !== undefined) {
      params.cursor = cursor
    }

    let response
    try {
      response = await axios.get<TeleportEventsResponse>(baseUrl, {
        headers,
        params,
        timeout: 20000,
        validateStatus: status => status < 500,
      })
    } catch (e) {
      const err = e as AxiosError
      logError(new Error(`获取 Teleport 事件失败: ${err.message}`))
      logForDiagnosticsNoPII('error', 'teleport_events_fetch_fail')
      return null
    }

    if (response.status === 404) {
      // 第 0 页的 404 在迁移窗口期具有歧义：
      //   (a) 会话确实不存在（既不在 Spanner 也不在 threadstore）——无数据可取。
      //   (b) 路由级 404：端点尚未部署，或会话是尚未回填至 Spanner 的 threadstore 会话。
      // 仅从响应无法区分。返回 null 让调用方回退到 session-ingress，
      // 后者对情况 (a) 正确返回空，对情况 (b) 返回数据。待回填完成且 session-ingress 移除后，
      // 回退也将返回 null → 呈现与当前相同的“获取会话日志失败”错误。
      //
      // 分页中途的 404（pages > 0）意味着会话在翻页间被删除——返回已获取部分。
      logForDebugging(
        `[teleport] 会话 ${sessionId} 未找到 (第 ${pages} 页)`,
      )
      logForDiagnosticsNoPII('warn', 'teleport_events_not_found')
      return pages === 0 ? null : all
    }

    if (response.status === 401) {
      logForDiagnosticsNoPII('error', 'teleport_events_bad_token')
      throw new Error(
        '您的会话已过期。请运行 /login 重新登录。',
      )
    }

    if (response.status !== 200) {
      logError(
        new Error(
          `Teleport 事件返回 ${response.status}: ${jsonStringify(response.data)}`,
        ),
      )
      logForDiagnosticsNoPII('error', 'teleport_events_bad_status')
      return null
    }

    const { data, next_cursor } = response.data
    if (!Array.isArray(data)) {
      logError(
        new Error(
          `Teleport 事件响应格式无效: ${jsonStringify(response.data)}`,
        ),
      )
      logForDiagnosticsNoPII('error', 'teleport_events_invalid_shape')
      return null
    }

    // payload 即为 Entry。对于 threadstore 非通用事件（服务端跳过）或解密失败，payload 为 null——此处同样跳过。
    for (const ev of data) {
      if (ev.payload !== null) {
        all.push(ev.payload)
      }
    }

    pages++
    // == null 同时覆盖 `null` 和 `undefined`——proto 在流结束时省略该字段，但部分序列化器可能输出 `null`。
    // 严格 `=== undefined` 会在遇到 `null` 时无限循环（查询参数中 cursor=null 会被字符串化为 "null"，服务端可能拒绝或回显）。
    if (next_cursor == null) {
      break
    }
    cursor = next_cursor
  }

  if (pages >= maxPages) {
    // 不视作失败——返回已获取部分。截断的转录记录总比完全没有好。
    logError(
      new Error(`Teleport 事件已达页数上限 (${maxPages})，会话 ${sessionId}`),
    )
    logForDiagnosticsNoPII('warn', 'teleport_events_page_cap')
  }

  logForDebugging(
    `[teleport] 为 ${sessionId} 获取了 ${all.length} 个事件，跨越 ${pages} 页`,
  )
  return all
}

/**
 * 从 URL 获取会话日志的共享实现
 */
async function fetchSessionLogsFromUrl(
  sessionId: string,
  url: string,
  headers: Record<string, string>,
): Promise<Entry[] | null> {
  try {
    const response = await axios.get(url, {
      headers,
      timeout: 20000,
      validateStatus: status => status < 500,
      params: isEnvTruthy(process.env.CLAUDE_AFTER_LAST_COMPACT)
        ? { after_last_compact: true }
        : undefined,
    })

    if (response.status === 200) {
      const data = response.data

      // 验证响应结构
      if (!data || typeof data !== 'object' || !Array.isArray(data.loglines)) {
        logError(
          new Error(
            `获取会话日志的响应格式无效: ${jsonStringify(data)}`,
          ),
        )
        logForDiagnosticsNoPII('error', 'session_get_fail_invalid_response')
        return null
      }

      const logs = data.loglines as Entry[]
      logForDebugging(
        `获取了 ${logs.length} 条会话日志，最后一条的 UUID 为 ${logs[logs.length - 1]?.uuid || '无'}`,
      )
      return logs
    }

    if (response.status === 404) {
      logForDebugging(`会话 ${sessionId} 无现有日志`)
      logForDiagnosticsNoPII('warn', 'session_get_no_logs_for_session')
      return []
    }

    if (response.status === 401) {
      logForDebugging('认证令牌已过期或无效')
      logForDiagnosticsNoPII('error', 'session_get_fail_bad_token')
      throw new Error(
        '您的会话已过期。请运行 /login 重新登录。',
      )
    }

    logForDebugging(
      `获取会话日志失败: ${response.status} ${response.statusText}`,
    )
    logForDiagnosticsNoPII('error', 'session_get_fail_status', {
      status: response.status,
    })
    return null
  } catch (error) {
    const axiosError = error as AxiosError<SessionIngressError>
    logError(new Error(`获取会话日志出错: ${axiosError.message}`))
    logForDiagnosticsNoPII('error', 'session_get_fail_status', {
      status: axiosError.status,
    })
    return null
  }
}

/**
 * 向后遍历条目，找到最后一个包含 uuid 的条目。
 * 某些条目类型（SummaryMessage、TagMessage）没有 uuid。
 */
function findLastUuid(logs: Entry[] | null): UUID | undefined {
  if (!logs) {
    return undefined
  }
  const entry = logs.findLast(e => 'uuid' in e && e.uuid)
  return entry && 'uuid' in entry ? (entry.uuid as UUID) : undefined
}

/**
 * 清除会话的缓存状态
 */
export function clearSession(sessionId: string): void {
  lastUuidMap.delete(sessionId)
  sequentialAppendBySession.delete(sessionId)
}

/**
 * 清除所有会话的缓存状态。
 * 在 /clear 时使用以释放子代理会话条目。
 */
export function clearAllSessions(): void {
  lastUuidMap.clear()
  sequentialAppendBySession.clear()
}