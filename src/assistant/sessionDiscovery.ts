import { getSessionHistory } from './sessionHistory.js'
import type { AssistantSession } from './sessionHistory.js'

/**
 * 发现助手会话
 * 
 * 查询并返回所有可用的助手会话
 * 
 * @param options - 发现选项
 * @param options.includeInactive - 是否包含非活跃会话
 * @param options.limit - 返回的最大会话数
 * @returns 助手会话列表
 */
export async function discoverAssistantSessions(options?: {
  includeInactive?: boolean
  limit?: number
}): Promise<AssistantSession[]> {
  const includeInactive = options?.includeInactive || false
  const limit = options?.limit || 50

  try {
    // 获取会话历史
    const history = await getSessionHistory()
    
    // 过滤和转换会话数据
    const sessions: AssistantSession[] = history.events
      .filter(event => {
        // 只包含会话开始事件
        if (event.type !== 'session_start') {
          return false
        }
        
        // 如果不包括非活跃会话，过滤掉已结束的
        if (!includeInactive && event.data?.status === 'ended') {
          return false
        }
        
        return true
      })
      .map(event => ({
        id: event.session_id || event.id,
        title: event.data?.title || `会话 ${event.session_id?.slice(0, 8)}`,
        createdAt: event.timestamp || new Date().toISOString(),
        status: event.data?.status || 'active',
        messageCount: event.data?.message_count || 0
      }))
      .slice(0, limit)
    
    return sessions
  } catch (error) {
    console.error('发现助手会话失败:', error)
    return []
  }
}

/**
 * 获取特定会话的详细信息
 * 
 * @param sessionId - 会话ID
 * @returns 会话详细信息
 */
export async function getAssistantSession(sessionId: string): Promise<AssistantSession | null> {
  try {
    const history = await getSessionHistory()
    
    const sessionEvents = history.events.filter(
      event => event.session_id === sessionId
    )
    
    if (sessionEvents.length === 0) {
      return null
    }
    
    const startEvent = sessionEvents.find(e => e.type === 'session_start')
    const endEvent = sessionEvents.find(e => e.type === 'session_end')
    
    return {
      id: sessionId,
      title: startEvent?.data?.title || `会话 ${sessionId.slice(0, 8)}`,
      createdAt: startEvent?.timestamp || new Date().toISOString(),
      status: endEvent ? 'ended' : 'active',
      messageCount: sessionEvents.length
    }
  } catch (error) {
    console.error('获取助手会话失败:', error)
    return null
  }
}

/**
 * 删除助手会话
 * 
 * @param sessionId - 要删除的会话ID
 * @returns 是否删除成功
 */
export async function deleteAssistantSession(sessionId: string): Promise<boolean> {
  try {
    // 这里可以添加实际的删除逻辑
    // 目前只是模拟删除操作
    console.log(`删除会话: ${sessionId}`)
    return true
  } catch (error) {
    console.error('删除助手会话失败:', error)
    return false
  }
}
