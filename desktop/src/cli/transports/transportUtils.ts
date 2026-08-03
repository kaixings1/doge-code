import { URL } from 'url'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { HybridTransport } from './HybridTransport.js'
import { SSETransport } from './SSETransport.js'
import type { Transport } from './Transport.js'
import { WebSocketTransport } from './WebSocketTransport.js'

/**
 * 辅助函数，用于获取适合 URL 的传输层。
 *
 * 传输选择优先级：
 * 1. SSETransport（SSE 读取 + POST 写入）当设置了 CLAUDE_CODE_USE_CCR_V2
 * 2. HybridTransport（WS 读取 + POST 写入）当设置了 CLAUDE_CODE_POST_FOR_SESSION_INGRESS_V2
 * 3. WebSocketTransport（WS 读取 + WS 写入）— 默认
 */
export function getTransportForUrl(
  url: URL,
  headers: Record<string, string> = {},
  sessionId?: string,
  refreshHeaders?: () => Record<string, string>,
): Transport {
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_CCR_V2)) {
    // v2：SSE 用于读取，HTTP POST 用于写入
    // --sdk-url 是会话 URL (.../sessions/{id})；
    // 通过附加 /worker/events/stream 推导出 SSE 流 URL
    const sseUrl = new URL(url.href)
    if (sseUrl.protocol === 'wss:') {
      sseUrl.protocol = 'https:'
    } else if (sseUrl.protocol === 'ws:') {
      sseUrl.protocol = 'http:'
    }
    sseUrl.pathname =
      sseUrl.pathname.replace(/\/$/, '') + '/worker/events/stream'
    return new SSETransport(sseUrl, headers, sessionId, refreshHeaders)
  }

  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    if (isEnvTruthy(process.env.CLAUDE_CODE_POST_FOR_SESSION_INGRESS_V2)) {
      return new HybridTransport(url, headers, sessionId, refreshHeaders)
    }
    return new WebSocketTransport(url, headers, sessionId, refreshHeaders)
  } else {
    throw new Error(`不支持的协议：${url.protocol}`)
  }
}
