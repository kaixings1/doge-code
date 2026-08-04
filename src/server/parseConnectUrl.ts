/**
 * 解析 Claude Code 连接 URL，提取服务器地址与认证 token。
 *
 * 支持的格式：
 * - `cc://host:port/path?token=xxx` → `{ serverUrl: 'http://host:port/path', authToken: 'xxx' }`
 * - `cc+unix:///absolute/path.sock?token=xxx` → `{ serverUrl: 'unix:/absolute/path.sock', authToken: 'xxx' }`
 * - `http(s)://host:port?token=xxx` → 原样保留 + token
 */
export function parseConnectUrl(url: string): { serverUrl: string; authToken: string } {
  const trimmed = (url || '').trim()

  // cc+unix:///absolute/path.sock?token=xxx
  if (trimmed.startsWith('cc+unix://')) {
    const rest = trimmed.slice('cc+unix://'.length)
    const [pathPart, queryPart] = rest.split('?')
    return {
      serverUrl: `unix:${pathPart || ''}`,
      authToken: extractToken(queryPart || ''),
    }
  }

  // cc://host:port/path?token=xxx
  if (trimmed.startsWith('cc://')) {
    const rest = trimmed.slice('cc://'.length)
    const [hostPart, queryPart] = rest.split('?')
    return {
      serverUrl: `http://${hostPart || ''}`,
      authToken: extractToken(queryPart || ''),
    }
  }

  // http(s):// 直接使用
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const [serverUrl, queryPart] = trimmed.split('?')
    return {
      serverUrl: serverUrl || '',
      authToken: extractToken(queryPart || ''),
    }
  }

  // 无法识别：原样返回，token 为空
  return { serverUrl: trimmed, authToken: '' }
}

function extractToken(query: string): string {
  const match = query.match(/[?&]?token=([^&]+)/)
  if (!match) return ''
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}
