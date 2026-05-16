import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import { extractErrorDetail } from './debugUtils.js'
import { toCompatSessionId } from './sessionIdCompat.js'

type GitSource = {
  type: 'git_repository'
  url: string
  revision?: string
}

type GitOutcome = {
  type: 'git_repository'
  git_info: { type: 'github'; repo: string; branches: string[] }
}

// 事件必须包装成 { type: 'event', data: <sdk_message> } 用于
// POST /v1/sessions 端点（区分联合格式）。
type SessionEvent = {
  type: 'event'
  data: SDKMessage
}

/**
 * 通过 POST /v1/sessions 在桥接器环境上创建会话。
 *
 * 被 `claude remote-control`（空会话，让用户可以立即输入）
 * 和 `/remote-control`（预填充了对话历史的会话）两者使用。
 *
 * 成功时返回会话 ID，如果创建失败则返回 null（非致命）。
 */
export async function createBridgeSession({
  environmentId,
  title,
  events,
  gitRepoUrl,
  branch,
  signal,
  baseUrl: baseUrlOverride,
  getAccessToken,
  permissionMode,
}: {
  environmentId: string
  title?: string
  events: SessionEvent[]
  gitRepoUrl: string | null
  branch: string
  signal: AbortSignal
  baseUrl?: string
  getAccessToken?: () => string | undefined
  permissionMode?: string
}): Promise<string | null> {
  const { getClaudeAIOAuthTokens } = await import('../utils/auth.js')
  const { getOrganizationUUID } = await import('../services/oauth/client.js')
  const { getOauthConfig } = await import('../constants/oauth.js')
  const { getOAuthHeaders } = await import('../utils/teleport/api.js')
  const { parseGitHubRepository } = await import('../utils/detectRepository.js')
  const { getDefaultBranch } = await import('../utils/git.js')
  const { getMainLoopModel } = await import('../utils/model/model.js')
  const { default: axios } = await import('axios')

  const accessToken =
    getAccessToken?.() ?? getClaudeAIOAuthTokens()?.accessToken
  if (!accessToken) {
    logForDebugging('[bridge] No access token for session creation')
    return null
  }

  const orgUUID = await getOrganizationUUID()
  if (!orgUUID) {
    logForDebugging('[bridge] No org UUID for session creation')
    return null
  }

  // 构建 git 源和结果上下文
  let gitSource: GitSource | null = null
  let gitOutcome: GitOutcome | null = null

  if (gitRepoUrl) {
    const { parseGitRemote } = await import('../utils/detectRepository.js')
    const parsed = parseGitRemote(gitRepoUrl)
    if (parsed) {
      const { host, owner, name } = parsed
      const revision = branch || (await getDefaultBranch()) || undefined
      gitSource = {
        type: 'git_repository',
        url: `https://${host}/${owner}/${name}`,
        revision,
      }
      gitOutcome = {
        type: 'git_repository',
        git_info: {
          type: 'github',
          repo: `${owner}/${name}`,
          branches: [`claude/${branch || 'task'}`],
        },
      }
    } else {
      // 回退：尝试 parseGitHubRepository 获取 owner/repo 格式
      const ownerRepo = parseGitHubRepository(gitRepoUrl)
      if (ownerRepo) {
        const [owner, name] = ownerRepo.split('/')
        if (owner && name) {
          const revision = branch || (await getDefaultBranch()) || undefined
          gitSource = {
            type: 'git_repository',
            url: `https://github.com/${owner}/${name}`,
            revision,
          }
          gitOutcome = {
            type: 'git_repository',
            git_info: {
              type: 'github',
              repo: `${owner}/${name}`,
              branches: [`claude/${branch || 'task'}`],
            },
          }
        }
      }
    }
  }

  const requestBody = {
    ...(title !== undefined && { title }),
    events,
    session_context: {
      sources: gitSource ? [gitSource] : [],
      outcomes: gitOutcome ? [gitOutcome] : [],
      model: getMainLoopModel(),
    },
    environment_id: environmentId,
    source: 'remote-control',
    ...(permissionMode && { permission_mode: permissionMode }),
  }

  const headers = {
    ...getOAuthHeaders(accessToken),
    'anthropic-beta': 'ccr-byoc-2025-07-29',
    'x-organization-uuid': orgUUID,
  }

  const url = `${baseUrlOverride ?? getOauthConfig().BASE_API_URL}/v1/sessions`
  let response
  try {
    response = await axios.post(url, requestBody, {
      headers,
      signal,
      validateStatus: s => s < 500,
    })
  } catch (err: unknown) {
    logForDebugging(
      `[bridge] Session creation request failed: ${errorMessage(err)}`,
    )
    return null
  }
  const isSuccess = response.status === 200 || response.status === 201

  if (!isSuccess) {
    const detail = extractErrorDetail(response.data)
    logForDebugging(
      `[bridge] 会话创建失败，状态码 ${response.status}${detail ? `: ${detail}` : ''}`,
    )
    return null
  }

  const sessionData: unknown = response.data
  if (
    !sessionData ||
    typeof sessionData !== 'object' ||
    !('id' in sessionData) ||
    typeof sessionData.id !== 'string'
  ) {
    logForDebugging('[bridge] 响应中没有会话 ID')
    return null
  }

  return sessionData.id
}

/**
 * 通过 GET /v1/sessions/{id} 获取桥接器会话。
 *
 * 返回会话的 environment_id（用于 `--session-id` 恢复）和 title。
 * 使用与 create/archive 相同的组织级别标头 — bridgeApi.ts 中的环境级别
 * 客户端使用不同的 beta 标头且没有组织 UUID，这会导致 Sessions API 返回 404。
 */
export async function getBridgeSession(
  sessionId: string,
  opts?: { baseUrl?: string; getAccessToken?: () => string | undefined },
): Promise<{ environment_id?: string; title?: string } | null> {
  const { getClaudeAIOAuthTokens } = await import('../utils/auth.js')
  const { getOrganizationUUID } = await import('../services/oauth/client.js')
  const { getOauthConfig } = await import('../constants/oauth.js')
  const { getOAuthHeaders } = await import('../utils/teleport/api.js')
  const { default: axios } = await import('axios')

  const accessToken =
    opts?.getAccessToken?.() ?? getClaudeAIOAuthTokens()?.accessToken
  if (!accessToken) {
    logForDebugging('[bridge] No access token for session fetch')
    return null
  }

  const orgUUID = await getOrganizationUUID()
  if (!orgUUID) {
    logForDebugging('[bridge] No org UUID for session fetch')
    return null
  }

  const headers = {
    ...getOAuthHeaders(accessToken),
    'anthropic-beta': 'ccr-byoc-2025-07-29',
    'x-organization-uuid': orgUUID,
  }

  const url = `${opts?.baseUrl ?? getOauthConfig().BASE_API_URL}/v1/sessions/${sessionId}`
  logForDebugging(`[bridge] Fetching session ${sessionId}`)

  let response
  try {
    response = await axios.get<{ environment_id?: string; title?: string }>(
      url,
      { headers, timeout: 10_000, validateStatus: s => s < 500 },
    )
  } catch (err: unknown) {
    logForDebugging(
      `[bridge] Session fetch request failed: ${errorMessage(err)}`,
    )
    return null
  }

  if (response.status !== 200) {
    const detail = extractErrorDetail(response.data)
    logForDebugging(
      `[bridge] 会话获取失败，状态码 ${response.status}${detail ? `: ${detail}` : ''}`,
    )
    return null
  }

  return response.data
}

/**
 * 通过 POST /v1/sessions/{id}/archive 归档桥接器会话。
 *
 * CCR 服务器从不自动归档会话 — 归档始终是
 * 显式的客户端操作。`claude remote-control`（独立桥接器）和
 * 常驻的 `/remote-control` REPL 桥接器都在关闭期间调用此函数以归档
 * 仍然活跃的会话。
 *
 * 归档端点接受任何状态的会话（running、idle、
 * requires_action、pending），如果已归档则返回 409，因此
 * 即使服务端运行程序已归档了该会话，调用也是安全的。
 *
 * 调用者必须处理错误 — 此函数没有 try/catch；5xx、
 * 超时和网络错误会抛出。归档在清理期间是尽力而为的；
 * 调用点使用 .catch() 包装。
 */
export async function archiveBridgeSession(
  sessionId: string,
  opts?: {
    baseUrl?: string
    getAccessToken?: () => string | undefined
    timeoutMs?: number
  },
): Promise<void> {
  const { getClaudeAIOAuthTokens } = await import('../utils/auth.js')
  const { getOrganizationUUID } = await import('../services/oauth/client.js')
  const { getOauthConfig } = await import('../constants/oauth.js')
  const { getOAuthHeaders } = await import('../utils/teleport/api.js')
  const { default: axios } = await import('axios')

  const accessToken =
    opts?.getAccessToken?.() ?? getClaudeAIOAuthTokens()?.accessToken
  if (!accessToken) {
    logForDebugging('[bridge] No access token for session archive')
    return
  }

  const orgUUID = await getOrganizationUUID()
  if (!orgUUID) {
    logForDebugging('[bridge] No org UUID for session archive')
    return
  }

  const headers = {
    ...getOAuthHeaders(accessToken),
    'anthropic-beta': 'ccr-byoc-2025-07-29',
    'x-organization-uuid': orgUUID,
  }

  const url = `${opts?.baseUrl ?? getOauthConfig().BASE_API_URL}/v1/sessions/${sessionId}/archive`
  logForDebugging(`[bridge] Archiving session ${sessionId}`)

  const response = await axios.post(
    url,
    {},
    {
      headers,
      timeout: opts?.timeoutMs ?? 10_000,
      validateStatus: s => s < 500,
    },
  )

  if (response.status === 200) {
    logForDebugging(`[bridge] Session ${sessionId} archived successfully`)
  } else {
    const detail = extractErrorDetail(response.data)
    logForDebugging(
      `[bridge] 会话归档失败，状态码 ${response.status}${detail ? `: ${detail}` : ''}`,
    )
  }
}

/**
 * 通过 PATCH /v1/sessions/{id} 更新桥接器会话的标题。
 *
 * 当用户在桥接器连接活动时通过 /rename 重命名会话时调用，
 * 以便标题在 claude.ai/code 上保持同步。
 *
 * 错误被吞掉 — 标题同步是尽力而为的。
 */
export async function updateBridgeSessionTitle(
  sessionId: string,
  title: string,
  opts?: { baseUrl?: string; getAccessToken?: () => string | undefined },
): Promise<void> {
  const { getClaudeAIOAuthTokens } = await import('../utils/auth.js')
  const { getOrganizationUUID } = await import('../services/oauth/client.js')
  const { getOauthConfig } = await import('../constants/oauth.js')
  const { getOAuthHeaders } = await import('../utils/teleport/api.js')
  const { default: axios } = await import('axios')

  const accessToken =
    opts?.getAccessToken?.() ?? getClaudeAIOAuthTokens()?.accessToken
  if (!accessToken) {
    logForDebugging('[bridge] No access token for session title update')
    return
  }

  const orgUUID = await getOrganizationUUID()
  if (!orgUUID) {
    logForDebugging('[bridge] No org UUID for session title update')
    return
  }

  const headers = {
    ...getOAuthHeaders(accessToken),
    'anthropic-beta': 'ccr-byoc-2025-07-29',
    'x-organization-uuid': orgUUID,
  }

  // 兼容网关仅接受 session_*（compat/convert.go:27）。v2 调用者
  // 传递原始的 cse_*；在此重新标记以便所有调用者可以传递它们持有的任何内容。
  // 对于 v1 的 session_* 和 bridgeMain 的预转换 compatSessionId 是幂等的。
  const compatId = toCompatSessionId(sessionId)
  const url = `${opts?.baseUrl ?? getOauthConfig().BASE_API_URL}/v1/sessions/${compatId}`
  logForDebugging(`[bridge] Updating session title: ${compatId} → ${title}`)

  try {
    const response = await axios.patch(
      url,
      { title },
      { headers, timeout: 10_000, validateStatus: s => s < 500 },
    )

    if (response.status === 200) {
      logForDebugging(`[bridge] Session title updated successfully`)
    } else {
      const detail = extractErrorDetail(response.data)
      logForDebugging(
        `[bridge] 会话标题更新失败，状态码 ${response.status}${detail ? `: ${detail}` : ''}`,
      )
    }
  } catch (err: unknown) {
    logForDebugging(
      `[bridge] Session title update request failed: ${errorMessage(err)}`,
    )
  }
}
