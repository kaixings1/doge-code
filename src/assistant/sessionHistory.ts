import axios from 'axios'
import { getOauthConfig } from '../constants/oauth.js'
import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import { logForDebugging } from '../utils/debug.js'
import { getOAuthHeaders, prepareApiRequest } from '../utils/teleport/api.js'

export const HISTORY_PAGE_SIZE = 100

export type HistoryPage = {
  /** 按时间正序排列的事件列表。 */
  events: SDKMessage[]
  /** 本页中最早的事件 ID，用于获取更早事件的游标。 */
  firstId: string | null
  /** 是否存在更早的事件。 */
  hasMore: boolean
}

type SessionEventsResponse = {
  data: SDKMessage[]
  has_more: boolean
  first_id: string | null
  last_id: string | null
}

export type HistoryAuthCtx = {
  baseUrl: string
  headers: Record<string, string>
}

/**
 * 助手会话信息
 */
export type AssistantSession = {
  id: string
  title: string
  createdAt: string
  status: 'active' | 'ended' | 'paused'
  messageCount: number
}

/** 一次性准备认证信息、请求头和基础 URL，供多个页面复用。 */
export async function createHistoryAuthCtx(
  sessionId: string,
): Promise<HistoryAuthCtx> {
  const { accessToken, orgUUID } = await prepareApiRequest()
  return {
    baseUrl: `${getOauthConfig().BASE_API_URL}/v1/sessions/${sessionId}/events`,
    headers: {
      ...getOAuthHeaders(accessToken),
      'anthropic-beta': 'ccr-byoc-2025-07-29',
      'x-organization-uuid': orgUUID,
    },
  }
}

async function fetchPage(
  ctx: HistoryAuthCtx,
  params: Record<string, string | number | boolean>,
  label: string,
): Promise<HistoryPage | null> {
  const resp = await axios
    .get<SessionEventsResponse>(ctx.baseUrl, {
      headers: ctx.headers,
      params,
      timeout: 15000,
      validateStatus: () => true,
    })
    .catch(() => null)
  if (!resp || resp.status !== 200) {
    logForDebugging(`[${label}] HTTP ${resp?.status ?? 'error'}`)
    return null
  }
  return {
    events: Array.isArray(resp.data.data) ? resp.data.data : [],
    firstId: resp.data.first_id,
    hasMore: resp.data.has_more,
  }
}

/**
 * 最新页：最后 `limit` 个事件，按时间正序，通过 anchor_to_latest 获取。
 * has_more=true 表示存在更早的事件。
 */
export async function fetchLatestEvents(
  ctx: HistoryAuthCtx,
  limit = HISTORY_PAGE_SIZE,
): Promise<HistoryPage | null> {
  return fetchPage(ctx, { limit, anchor_to_latest: true }, 'fetchLatestEvents')
}

/** 更早页：紧邻 `beforeId` 游标之前的事件。 */
export async function fetchOlderEvents(
  ctx: HistoryAuthCtx,
  beforeId: string,
  limit = HISTORY_PAGE_SIZE,
): Promise<HistoryPage | null> {
  return fetchPage(ctx, { limit, before_id: beforeId }, 'fetchOlderEvents')
}

/**
 * 获取助手会话历史
 * 
 * @param sessionId - 可选的会话ID，如果提供则只获取该会话的历史
 * @returns 会话历史
 */
export async function getSessionHistory(sessionId?: string): Promise<HistoryPage> {
  try {
    const ctx = await createHistoryAuthCtx(sessionId || 'default')
    const page = await fetchLatestEvents(ctx, HISTORY_PAGE_SIZE)
    
    if (!page) {
      return {
        events: [],
        firstId: null,
        hasMore: false
      }
    }
    
    return page
  } catch (error) {
    console.error('获取会话历史失败:', error)
    return {
      events: [],
      firstId: null,
      hasMore: false
    }
  }
}

/**
 * 获取所有助手会话列表
 * 
 * @returns 助手会话列表
 */
export async function listAssistantSessions(): Promise<AssistantSession[]> {
  try {
    const history = await getSessionHistory()
    
    // 从事件中提取唯一的会话
    const sessionMap = new Map<string, AssistantSession>()
    
    history.events.forEach(event => {
      if (event.session_id) {
        if (!sessionMap.has(event.session_id)) {
          sessionMap.set(event.session_id, {
            id: event.session_id,
            title: event.data?.title || `会话 ${event.session_id.slice(0, 8)}`,
            createdAt: event.timestamp || new Date().toISOString(),
            status: event.type === 'session_end' ? 'ended' : 'active',
            messageCount: 0
          })
        }
        
        const session = sessionMap.get(event.session_id)!
        session.messageCount++
        
        if (event.type === 'session_end') {
          session.status = 'ended'
        }
      }
    })
    
    return Array.from(sessionMap.values())
  } catch (error) {
    console.error('获取助手会话列表失败:', error)
    return []
  }
}
