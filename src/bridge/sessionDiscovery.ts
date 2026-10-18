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
