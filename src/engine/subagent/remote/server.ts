/**
 * engine/subagent/remote/server.ts — TypeScript Agent Protocol Server
 *
 * 吸收自 Deep Agents async-subagent-server (FastAPI)。
 * 实现 Agent Protocol 端点，支持外部 supervisor 通过 HTTP 调度异步子代理。
 *
 * 端点：
 *   GET  /ok                        健康检查
 *   POST /threads                   创建线程
 *   POST /threads/{id}/runs         创建运行（异步执行）
 *   GET  /threads/{id}/runs/{rid}   查询运行状态
 *   GET  /threads/{id}              获取线程状态
 *   POST /threads/{id}/runs/{rid}/cancel  取消运行
 *
 * 依赖：Bun 原生 http 模块（无需第三方框架）。
 * 存储：内存 Map（生产环境可替换为 SQLite/Redis）。
 */

import type { AgentThread, AgentRun, CreateThreadBody, CreateRunBody, HealthResponse } from './types.js'

// ============================================================================
// 存储层（内存 Map，可替换为持久化后端）
// ============================================================================

const threads = new Map<string, AgentThread>()
const runs = new Map<string, AgentRun>()

// ============================================================================
// Agent 执行器（由调用方注入）
// ============================================================================

export type AgentExecutor = (messages: Array<{ role: string; content: string }>) => Promise<string>

let agentExecutor: AgentExecutor | null = null

/** 注册 Agent 执行器 */
export function setAgentExecutor(fn: AgentExecutor): void {
  agentExecutor = fn
}

// ============================================================================
// HTTP 服务器
// ============================================================================

const PORT = parseInt(process.env.AGENT_PROTOCOL_PORT ?? '2024', 10)

/** 启动 Agent Protocol 服务器 */
export function startAgentProtocolServer(): void {
  const server = Bun.serve({
    port: PORT,
    fetch: async (req): Promise<Response> => {
      const url = new URL(req.url)
      const path = url.pathname

      // CORS 头
      const corsHeaders: Record<string, string> = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }

      if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders })
      }

      try {
        // GET /ok — 健康检查
        if (path === '/ok' && req.method === 'GET') {
          return jsonResponse({ ok: true }, corsHeaders)
        }

        // POST /threads — 创建线程
        if (path === '/threads' && req.method === 'POST') {
          const body = (await req.json()) as CreateThreadBody
          const threadId = crypto.randomUUID()
          const now = new Date().toISOString()
          const thread: AgentThread = {
            thread_id: threadId,
            created_at: now,
            messages: [],
            values: {},
          }
          threads.set(threadId, thread)
          return jsonResponse(thread, corsHeaders, 201)
        }

        // POST /threads/{id}/runs — 创建运行
        const runMatch = path.match(/^\/threads\/([^/]+)\/runs$/)
        if (runMatch && req.method === 'POST') {
          const threadId = runMatch[1]
          const thread = threads.get(threadId)
          if (!thread) {
            return jsonResponse({ detail: 'Thread not found' }, corsHeaders, 404)
          }

          const body = (await req.json()) as CreateRunBody
          const messages = body.input?.messages ?? []
          const userMessage = messages.find((m) => m.role === 'user')?.content ?? ''

          // interrupt 策略：取消运行中任务，清空线程
          if (body.multitask_strategy === 'interrupt') {
            for (const run of runs.values()) {
              if (run.thread_id === threadId && run.status === 'running') {
                run.status = 'cancelled'
              }
            }
            thread.messages = []
            thread.values = {}
          }

          // 追加用户消息
          if (userMessage) {
            thread.messages.push({ role: 'user', content: userMessage })
          }

          const runId = crypto.randomUUID()
          const now = new Date().toISOString()
          const run: AgentRun = {
            run_id: runId,
            thread_id: threadId,
            assistant_id: body.assistant_id ?? 'default',
            status: 'pending',
            created_at: now,
          }
          runs.set(runId, run)

          // 异步执行
          if (agentExecutor) {
            executeAsync(runId, threadId, thread.messages)
          }

          return jsonResponse(run, corsHeaders, 201)
        }

        // GET /threads/{id}/runs/{rid} — 查询运行状态
        const getRunMatch = path.match(/^\/threads\/([^/]+)\/runs\/([^/]+)$/)
        if (getRunMatch && req.method === 'GET') {
          const [, threadId, runId] = getRunMatch
          const run = runs.get(runId)
          if (!run || run.thread_id !== threadId) {
            return jsonResponse({ detail: 'Run not found' }, corsHeaders, 404)
          }
          return jsonResponse(run, corsHeaders)
        }

        // GET /threads/{id} — 获取线程状态
        if (path.match(/^\/threads\/[^/]+$/) && req.method === 'GET') {
          const threadId = path.split('/')[2]
          const thread = threads.get(threadId)
          if (!thread) {
            return jsonResponse({ detail: 'Thread not found' }, corsHeaders, 404)
          }
          return jsonResponse(thread, corsHeaders)
        }

        // POST /threads/{id}/runs/{rid}/cancel — 取消运行
        const cancelMatch = path.match(/^\/threads\/([^/]+)\/runs\/([^/]+)\/cancel$/)
        if (cancelMatch && req.method === 'POST') {
          const [, threadId, runId] = cancelMatch
          const run = runs.get(runId)
          if (!run || run.thread_id !== threadId) {
            return jsonResponse({ detail: 'Run not found' }, corsHeaders, 404)
          }
          run.status = 'cancelled'
          return jsonResponse({ ...run, status: 'cancelled' }, corsHeaders)
        }

        return jsonResponse({ detail: 'Not Found' }, corsHeaders, 404)
      } catch (err) {
        return jsonResponse(
          { detail: err instanceof Error ? err.message : 'Internal error' },
          corsHeaders,
          500,
        )
      }
    },
  })

  console.log(`[agent-protocol] server listening on :${PORT}`)
}

/** JSON 响应辅助 */
function jsonResponse(
  data: unknown,
  headers: Record<string, string>,
  status = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

/** 异步执行 Agent 任务 */
async function executeAsync(runId: string, threadId: string, messages: Array<{ role: string; content: string }>): Promise<void> {
  const run = runs.get(runId)
  if (!run) return

  run.status = 'running'
  try {
    if (!agentExecutor) {
      throw new Error('Agent executor not configured')
    }
    const output = await agentExecutor(messages)
    const thread = threads.get(threadId)
    if (thread) {
      thread.messages.push({ role: 'assistant', content: output })
      thread.values = { messages: thread.messages }
    }
    run.status = 'success'
  } catch (err) {
    run.status = 'error'
    run.error = err instanceof Error ? err.message : String(err)
  }
}
