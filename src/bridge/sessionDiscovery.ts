import { getLocalBridgeUrl } from './bridgeConfig.js'

/**
 * 跨会话 @ 提及的会话发现层（W32 微提交2）。
 *
 * 数据源：本地桥服务器 `GET /v1/code/sessions` 返回的活跃会话清单
 * （每个含 id 与 metadata.name）。本地桥在 registerSession 时已把 CLI
 * 传入的 initialName 写入 metadata，故这里可构造 「@name → sessionId」 映射。
 *
 * 解析层（attachments.ts 的 processSessionMentions）拿到这个映射后，
 * 把 `@session-<name>` 解析成携带 targetSessionId 的附件；投递层再据此
 * 经本地桥把消息转发到目标 session。
 */

export type DiscoveredSession = {
  sessionId: string
  name: string
}

/** 解析服务器响应为「name → sessionId」映射。name 缺失的会话被跳过。 */
export function parseSessionsResponse(
  body: unknown,
  selfSessionId?: string,
): Map<string, string> {
  const map = new Map<string, string>()
  const list = (body as { sessions?: Array<{ id?: string; metadata?: { name?: string } }> })
    ?.sessions
  if (!Array.isArray(list)) return map
  for (const s of list) {
    const id = s?.id
    const name = s?.metadata?.name
    if (typeof id === 'string' && typeof name === 'string') {
      if (selfSessionId && id === selfSessionId) continue
      map.set(name, id)
    }
  }
  return map
}

/**
 * 拉取本地桥所有活跃会话，返回 name→sessionId 映射（已排除自身）。
 * fetchImpl 可注入用于测试；默认走全局 fetch。
 * 任何网络/解析失败都降级为空映射（不阻断主流程）。
 */
export async function discoverSessions(
  selfSessionId?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, string>> {
  try {
    const res = await fetchImpl(`${getLocalBridgeUrl()}/v1/code/sessions`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) return new Map()
    const body = (await res.json()) as unknown
    return parseSessionsResponse(body, selfSessionId)
  } catch {
    return new Map()
  }
}

/**
 * 跨会话投递：把一条用户消息转发到目标 session（W32 微提交3）。
 *
 * 经本地桥 REST 端点 POST /v1/code/sessions/{id}/message，服务器收到后
 * broadcast 给目标 session 的所有订阅者（含目标 CLI 自身）。服务器端用
 * excludeWs 排除投递方连接，客户端用 isOutboundEcho 双保险过滤回声，
 * 防止自我回灌死循环（见 .dogerules 广播回灌环路守则）。
 *
 * 返回 true 表示投递成功（200）。目标 session 不存在 / 网络失败返回 false
 * （降级为普通文本，不阻断主流程）。
 */
export async function deliverMessageToSession(
  targetSessionId: string,
  content: string,
  fromSessionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchImpl(
      `${getLocalBridgeUrl()}/v1/code/sessions/${encodeURIComponent(targetSessionId)}/message`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, fromSessionId }),
      },
    )
    return res.ok
  } catch {
    return false
  }
}

