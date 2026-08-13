/**
 * engine/subagent/remote/types.ts — Async Subagent Protocol 类型定义
 *
 * 吸收自 Deep Agents async-subagent-server (Agent Protocol over FastAPI)。
 * 定义线程/任务的生命周期端点，供外部 supervisor 通过 HTTP 调用。
 */

/** 线程（一次对话会话） */
export interface AgentThread {
  thread_id: string
  created_at: string
  messages: Array<{ role: string; content: string }>
  values: Record<string, unknown>
}

/** 运行（一次执行尝试） */
export interface AgentRun {
  run_id: string
  thread_id: string
  assistant_id: string
  status: 'pending' | 'running' | 'success' | 'error' | 'cancelled'
  created_at: string
  error?: string
}

/** 创建线程请求体 */
export interface CreateThreadBody {}

/** 创建运行请求体 */
export interface CreateRunBody {
  assistant_id?: string
  multitask_strategy?: 'interrupt' | 'wait'
  input?: {
    messages?: Array<{ role: string; content: string }>
  }
}

/** 健康检查响应 */
export interface HealthResponse {
  ok: boolean
}
