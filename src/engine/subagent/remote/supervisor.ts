/**
 * engine/subagent/remote/supervisor.ts — Agent Protocol 客户端
 *
 * 吸收自 Deep Agents async-subagent-server supervisor.py。
 * 提供与远程 Agent Protocol 服务器交互的客户端方法。
 */

import type { AgentThread, AgentRun, CreateRunBody } from './types.js'

const DEFAULT_BASE = process.env.AGENT_PROTOCOL_URL ?? 'http://localhost:2024'

// ============================================================================
// Agent Protocol 客户端
// ============================================================================

export interface AgentProtocolClient {
  /** 创建线程 */
  createThread(): Promise<AgentThread>
  /** 启动异步任务 */
  startAsyncTask(threadId: string, input: Array<{ role: string; content: string }>, assistantId?: string): Promise<AgentRun>
  /** 检查任务状态 */
  checkAsyncTask(threadId: string, runId: string): Promise<AgentRun>
  /** 更新任务（中断并重新开始） */
  updateAsyncTask(threadId: string, runId: string, input: Array<{ role: string; content: string }>): Promise<AgentRun>
  /** 取消任务 */
  cancelAsyncTask(threadId: string, runId: string): Promise<AgentRun>
  /** 获取线程状态 */
  getThread(threadId: string): Promise<AgentThread>
  /** 健康检查 */
  healthCheck(): Promise<boolean>
}

export class HttpAgentProtocolClient implements AgentProtocolClient {
  constructor(private baseUrl: string = DEFAULT_BASE) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error')
      throw new Error(`HTTP ${res.status}: ${text}`)
    }
    return res.json()
  }

  async createThread(): Promise<AgentThread> {
    return this.request<AgentThread>('POST', '/threads')
  }

  async startAsyncTask(
    threadId: string,
    input: Array<{ role: string; content: string }>,
    assistantId = 'default',
  ): Promise<AgentRun> {
    const body: CreateRunBody = {
      assistant_id: assistantId,
      input: { messages: input },
    }
    return this.request<AgentRun>('POST', `/threads/${threadId}/runs`, body)
  }

  async checkAsyncTask(threadId: string, runId: string): Promise<AgentRun> {
    return this.request<AgentRun>('GET', `/threads/${threadId}/runs/${runId}`)
  }

  async updateAsyncTask(
    threadId: string,
    runId: string,
    input: Array<{ role: string; content: string }>,
  ): Promise<AgentRun> {
    const body: CreateRunBody = {
      multitask_strategy: 'interrupt',
      input: { messages: input },
    }
    return this.request<AgentRun>('POST', `/threads/${threadId}/runs/${runId}`, body)
  }

  async cancelAsyncTask(threadId: string, runId: string): Promise<AgentRun> {
    return this.request<AgentRun>('POST', `/threads/${threadId}/runs/${runId}/cancel`)
  }

  async getThread(threadId: string): Promise<AgentThread> {
    return this.request<AgentThread>('GET', `/threads/${threadId}`)
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.request<HealthResponse>('GET', '/ok')
      return result.ok === true
    } catch {
      return false
    }
  }
}
