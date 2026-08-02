/**
 * Local Bridge Server — 模拟 Anthropic CCR v2 协议的最小服务端实现。
 *
 * 让 `claude /remote-control` 在本地运行，无需 Anthropic 账户。
 * 用法：
 *   bun run local-bridge-server/server.ts
 * 或编译为独立可执行文件：
 *   bun build local-bridge-server/server.ts --compile --outfile local-bridge
 *
 * 启动后监听 http://localhost:5678，客户端通过环境变量连接：
 *   set CLAUDE_CODE_LOCAL_BRIDGE=1 && claude /remote-control
 */

import { randomUUID } from 'crypto'

const PORT = Number(process.env.PORT ?? 5678)
const SERVER_LABEL = '[local-bridge]'

// ── 会话存储 ────────────────────────────────────────────────────────────────

interface Session {
  id: string
  title: string
  createdAt: number
  workerEpoch: number
  workerJwt: string
  archived: boolean
  events: ServerEvent[]
  lastSequenceNum: number
}

interface ServerEvent {
  id: string
  sequenceNum: number
  data: string
  timestamp: number
}

const sessions = new Map<string, Session>()

// 简单的 token 验证（任何非空字符串都接受）
function validateToken(_token: string): boolean {
  return true
}

// 从 Authorization header 提取 token
function extractToken(req: Request): string | undefined {
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice(7)
  return undefined
}

// ── SSE 流管理 ───────────────────────────────────────────────────────────────

interface SseClient {
  id: string
  sessionId: string
  controller: ReadableStreamDefaultController<string>
  lastSequenceNum: number
}

const sseClients = new Map<string, SseClient>()

// 向特定会话的所有 SSE 客户端广播事件
function broadcastToSession(sessionId: string, event: ServerEvent): void {
  for (const client of sseClients.values()) {
    if (client.sessionId === sessionId) {
      try {
        client.controller.enqueue(`data: ${event.data}\n\n`)
      } catch {
        // 客户端可能已断开
      }
    }
  }
}

// ── HTTP 处理 ────────────────────────────────────────────────────────────────

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method

  console.log(`${SERVER_LABEL} ${method} ${path}`)

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, anthropic-version, anthropic-beta, x-organization-uuid',
  }

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    // ── 健康检查 ──────────────────────────────────────────────────────────
    if (path === '/health') {
      return jsonResponse({ status: 'ok', sessions: sessions.size }, corsHeaders)
    }

    // ── v2: 创建会话 ─────────────────────────────────────────────────────
    // POST /v1/code/sessions
    if (path === '/v1/code/sessions' && method === 'POST') {
      const token = extractToken(req)
      if (!token || !validateToken(token)) {
        return jsonResponse({ error: { type: 'unauthorized', message: '认证失败' } }, { ...corsHeaders, status: 401 })
      }
      const body = await req.json().catch(() => ({}))
      const sessionId = `cse_local_${randomUUID().replace(/-/g, '')}`
      const jwt = `local_jwt_${randomUUID().replace(/-/g, '')}`
      const session: Session = {
        id: sessionId,
        title: body?.title ?? 'Local Bridge Session',
        createdAt: Date.now(),
        workerEpoch: 1,
        workerJwt: jwt,
        archived: false,
        events: [],
        lastSequenceNum: 0,
      }
      sessions.set(sessionId, session)
      console.log(`${SERVER_LABEL} 会话已创建: ${sessionId}`)
      return jsonResponse({ session: { id: sessionId, title: session.title } }, corsHeaders)
    }

    // ── v2: 获取桥接凭据 ─────────────────────────────────────────────────
    // POST /v1/code/sessions/{id}/bridge
    const bridgeMatch = path.match(/^\/v1\/code\/sessions\/(cse_[^\/]+)\/bridge$/)
    if (bridgeMatch && method === 'POST') {
      const token = extractToken(req)
      if (!token || !validateToken(token)) {
        return jsonResponse({ error: { type: 'unauthorized', message: '认证失败' } }, { ...corsHeaders, status: 401 })
      }
      const sessionId = bridgeMatch[1]!
      const session = sessions.get(sessionId)
      if (!session) {
        return jsonResponse({ error: { type: 'not_found', message: '会话未找到' } }, { ...corsHeaders, status: 404 })
      }
      // 每次 /bridge 调用递增 epoch（与真实服务端行为一致）
      session.workerEpoch++
      session.workerJwt = `local_jwt_${randomUUID().replace(/-/g, '')}`
      console.log(`${SERVER_LABEL} 桥接凭据已颁发: ${sessionId} epoch=${session.workerEpoch}`)
      return jsonResponse({
        worker_jwt: session.workerJwt,
        api_base_url: `http://localhost:${PORT}`,
        expires_in: 3600,
        worker_epoch: session.workerEpoch,
      }, corsHeaders)
    }

    // ── v2: 注册工作器（如果客户端没有从 /bridge 获取 epoch）────────────
    // POST /v1/code/sessions/{id}/worker/register
    const registerMatch = path.match(/^\/v1\/code\/sessions\/(cse_[^\/]+)\/worker\/register$/)
    if (registerMatch && method === 'POST') {
      const token = extractToken(req)
      if (!token || !validateToken(token)) {
        return jsonResponse({ error: { type: 'unauthorized', message: '认证失败' } }, { ...corsHeaders, status: 401 })
      }
      const sessionId = registerMatch[1]!
      const session = sessions.get(sessionId)
      if (!session) {
        return jsonResponse({ error: { type: 'not_found', message: '会话未找到' } }, { ...corsHeaders, status: 404 })
      }
      session.workerEpoch++
      console.log(`${SERVER_LABEL} 工作器已注册: ${sessionId} epoch=${session.workerEpoch}`)
      return jsonResponse({ worker_epoch: session.workerEpoch }, corsHeaders)
    }

    // ── v2: SSE 事件流（读取入站消息）──────────────────────────────────
    // GET /v1/code/sessions/{id}/worker/events/stream
    const streamMatch = path.match(/^\/v1\/code\/sessions\/(cse_[^\/]+)\/worker\/events\/stream$/)
    if (streamMatch && method === 'GET') {
      const token = extractToken(req)
      if (!token || !validateToken(token)) {
        return jsonResponse({ error: { type: 'unauthorized', message: '认证失败' } }, { ...corsHeaders, status: 401 })
      }
      const sessionId = streamMatch[1]!
      const session = sessions.get(sessionId)
      if (!session) {
        return jsonResponse({ error: { type: 'not_found', message: '会话未找到' } }, { ...corsHeaders, status: 404 })
      }

      const clientId = randomUUID()
      const fromSeq = Number(url.searchParams.get('from_sequence_num') ?? '0')

      // 创建 SSE 流
      const stream = new ReadableStream<string>({
        start(controller) {
          const client: SseClient = {
            id: clientId,
            sessionId,
            controller,
            lastSequenceNum: fromSeq,
          }
          sseClients.set(clientId, client)

          try {
            // 发送初始注释
            controller.enqueue(`: connected ${clientId}\n\n`)
            // 重放 fromSeq 之后的历史事件
            for (const event of session.events) {
              if (event.sequenceNum > fromSeq) {
                controller.enqueue(`data: ${event.data}\n\n`)
                client.lastSequenceNum = event.sequenceNum
              }
            }
          } catch {
            // 客户端可能在 start() 期间断开
            sseClients.delete(clientId)
          }

          console.log(`${SERVER_LABEL} SSE 客户端已连接: ${clientId} (session=${sessionId}, fromSeq=${fromSeq})`)
        },
        cancel() {
          sseClients.delete(clientId)
          console.log(`${SERVER_LABEL} SSE 客户端已断开: ${clientId}`)
        },
      })

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    }

    // ── v2: 接收出站事件（客户端发送的消息）─────────────────────────────
    // POST /v1/code/sessions/{id}/worker/events
    const eventsMatch = path.match(/^\/v1\/code\/sessions\/(cse_[^\/]+)\/worker\/events$/)
    if (eventsMatch && method === 'POST') {
      const token = extractToken(req)
      if (!token || !validateToken(token)) {
        return jsonResponse({ error: { type: 'unauthorized', message: '认证失败' } }, { ...corsHeaders, status: 401 })
      }
      const sessionId = eventsMatch[1]!
      const session = sessions.get(sessionId)
      if (!session) {
        return jsonResponse({ error: { type: 'not_found', message: '会话未找到' } }, { ...corsHeaders, status: 404 })
      }

      const body = await req.json().catch(() => ({}))
      const events = (body.events ?? [body]) as Record<string, unknown>[]

      for (const event of events) {
        session.lastSequenceNum++
        const serverEvent: ServerEvent = {
          id: randomUUID(),
          sequenceNum: session.lastSequenceNum,
          data: JSON.stringify(event),
          timestamp: Date.now(),
        }
        session.events.push(serverEvent)
        console.log(`${SERVER_LABEL} 事件 #${serverEvent.sequenceNum} 来自 ${sessionId}: ${JSON.stringify(event).slice(0, 120)}`)
      }

      return jsonResponse({ ok: true }, corsHeaders)
    }

    // ── v2: 报告状态（心跳等）────────────────────────────────────────────
    // PUT /v1/code/sessions/{id}/worker/state
    const stateMatch = path.match(/^\/v1\/code\/sessions\/(cse_[^\/]+)\/worker\/state$/)
    if (stateMatch && method === 'PUT') {
      const token = extractToken(req)
      if (!token || !validateToken(token)) {
        return jsonResponse({ error: { type: 'unauthorized', message: '认证失败' } }, { ...corsHeaders, status: 401 })
      }
      const sessionId = stateMatch[1]!
      const session = sessions.get(sessionId)
      if (!session) {
        return jsonResponse({ error: { type: 'not_found', message: '会话未找到' } }, { ...corsHeaders, status: 404 })
      }
      const body = await req.json().catch(() => ({}))
      console.log(`${SERVER_LABEL} 状态更新 ${sessionId}: ${JSON.stringify(body).slice(0, 100)}`)
      return jsonResponse({ ok: true }, corsHeaders)
    }

    // ── v2: 投递确认 ─────────────────────────────────────────────────────
    // POST /v1/code/sessions/{id}/worker/events/{eventId}/delivery
    const deliveryMatch = path.match(/^\/v1\/code\/sessions\/(cse_[^\/]+)\/worker\/events\/([^\/]+)\/delivery$/)
    if (deliveryMatch && method === 'POST') {
      return jsonResponse({ ok: true }, corsHeaders)
    }

    // ── v1 兼容: 归档会话 ─────────────────────────────────────────────────
    // POST /v1/sessions/{id}/archive
    const archiveMatch = path.match(/^\/v1\/sessions\/([^\/]+)\/archive$/)
    if (archiveMatch && method === 'POST') {
      const sessionId = archiveMatch[1]!
      // 查找兼容格式的会话 ID（session_xxx 或 cse_xxx）
      const session = findSessionByCompatId(sessionId)
      if (session) {
        session.archived = true
        console.log(`${SERVER_LABEL} 会话已归档: ${session.id}`)
      } else {
        console.log(`${SERVER_LABEL} 归档: 会话未找到 ${sessionId}（视为已归档）`)
      }
      return jsonResponse({}, corsHeaders)
    }

    // ── v1 兼容: 更新会话标题 ─────────────────────────────────────────────
    // PATCH /v1/sessions/{id}
    const patchMatch = path.match(/^\/v1\/sessions\/([^\/]+)$/)
    if (patchMatch && method === 'PATCH') {
      const sessionId = patchMatch[1]!
      const session = findSessionByCompatId(sessionId)
      if (session) {
        const body = await req.json().catch(() => ({}))
        if (body.title) {
          session.title = body.title
          console.log(`${SERVER_LABEL} 标题已更新: ${session.id} → ${body.title}`)
        }
      }
      return jsonResponse({}, corsHeaders)
    }

    // ── v1 兼容: 获取会话 ─────────────────────────────────────────────────
    // GET /v1/sessions/{id}
    const getSessionMatch = path.match(/^\/v1\/sessions\/([^\/]+)$/)
    if (getSessionMatch && method === 'GET') {
      const sessionId = getSessionMatch[1]!
      const session = findSessionByCompatId(sessionId)
      if (!session) {
        return jsonResponse({ error: { type: 'not_found' } }, { ...corsHeaders, status: 404 })
      }
      return jsonResponse({ id: session.id, title: session.title, environment_id: '' }, corsHeaders)
    }

    // ── v1 兼容: 环境注册 ─────────────────────────────────────────────────
    // POST /v1/environments/bridge
    if (path === '/v1/environments/bridge' && method === 'POST') {
      const token = extractToken(req)
      if (!token || !validateToken(token)) {
        return jsonResponse({ error: { type: 'unauthorized', message: '认证失败' } }, { ...corsHeaders, status: 401 })
      }
      const envId = `env_local_${randomUUID().replace(/-/g, '').slice(0, 16)}`
      const envSecret = `secret_${randomUUID().replace(/-/g, '')}`
      console.log(`${SERVER_LABEL} 环境已注册: ${envId}`)
      return jsonResponse({ environment_id: envId, environment_secret: envSecret }, corsHeaders)
    }

    // ── v1 兼容: 工作轮询（永远返回空 — 本地模式无远程工作）─────────────
    // GET /v1/environments/{id}/work/poll
    const pollMatch = path.match(/^\/v1\/environments\/([^\/]+)\/work\/poll$/)
    if (pollMatch && method === 'GET') {
      return jsonResponse(null, corsHeaders)
    }

    // ── v1 兼容: 工作确认 ─────────────────────────────────────────────────
    // POST /v1/environments/{id}/work/{workId}/ack
    const ackMatch = path.match(/^\/v1\/environments\/([^\/]+)\/work\/([^\/]+)\/ack$/)
    if (ackMatch && method === 'POST') {
      return jsonResponse({}, corsHeaders)
    }

    // ── v1 兼容: 心跳 ─────────────────────────────────────────────────────
    // POST /v1/environments/{id}/work/{workId}/heartbeat
    const heartbeatMatch = path.match(/^\/v1\/environments\/([^\/]+)\/work\/([^\/]+)\/heartbeat$/)
    if (heartbeatMatch && method === 'POST') {
      return jsonResponse({ lease_extended: true, state: 'running' }, corsHeaders)
    }

    // ── v1 兼容: 注销环境 ─────────────────────────────────────────────────
    // DELETE /v1/environments/bridge/{id}
    const deregisterMatch = path.match(/^\/v1\/environments\/bridge\/([^\/]+)$/)
    if (deregisterMatch && method === 'DELETE') {
      console.log(`${SERVER_LABEL} 环境已注销: ${deregisterMatch[1]}`)
      return jsonResponse({}, corsHeaders)
    }

    // ── 默认: 404 ─────────────────────────────────────────────────────────
    console.log(`${SERVER_LABEL} 未找到: ${method} ${path}`)
    return jsonResponse({ error: { type: 'not_found', message: `${method} ${path}` } }, { ...corsHeaders, status: 404 })

  } catch (err) {
    console.error(`${SERVER_LABEL} 错误:`, err)
    return jsonResponse({ error: { type: 'internal_error', message: String(err) } }, { ...corsHeaders, status: 500 })
  }
}

// ── 辅助 ─────────────────────────────────────────────────────────────────────

function jsonResponse(data: Record<string, unknown>, extra: Record<string, string | number> = {}): Response {
  const { status: statusStr, ...headers } = extra
  const status = Number(statusStr ?? 200)
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers as Record<string, string> },
  })
}

// 兼容 session_* 和 cse_* ID 格式
function findSessionByCompatId(id: string): Session | undefined {
  // 直接匹配
  const direct = sessions.get(id)
  if (direct) return direct
  // 提取 body 部分匹配
  const body = id.slice(id.lastIndexOf('_') + 1)
  for (const session of sessions.values()) {
    const sessionBody = session.id.slice(session.id.lastIndexOf('_') + 1)
    if (sessionBody === body) return session
  }
  return undefined
}

// ── 启动 ─────────────────────────────────────────────────────────────────────

console.log(`${SERVER_LABEL} 本地桥接服务器启动中...`)
console.log(`${SERVER_LABEL} 监听: http://localhost:${PORT}`)
console.log(`${SERVER_LABEL} 客户端用法: set CLAUDE_CODE_LOCAL_BRIDGE=1 && claude /remote-control`)

Bun.serve({
  port: PORT,
  fetch: handleRequest,
})

console.log(`${SERVER_LABEL} 服务器已就绪 ✓`)
