import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import type { ServerConfig } from './types.js'

interface ServerLoggerLike {
  info: (...args: any[]) => void
  error: (...args: any[]) => void
  warn: (...args: any[]) => void
  debug: (...args: any[]) => void
}

const noopLogger: ServerLoggerLike = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf-8')
}

function isAuthorized(req: IncomingMessage, authToken: string): boolean {
  const header = req.headers['authorization']
  return header === `Bearer ${authToken}`
}

/**
 * 启动 HTTP 会话服务器。
 *
 * 路由：
 *   GET    /health                 健康检查
 *   POST   /sessions               创建会话 { cwd, dangerously_skip_permissions } → { session_id, work_dir }
 *   GET    /sessions               列出会话
 *   GET    /session/:id            会话详情
 *   DELETE /session/:id            销毁会话
 *   POST   /session/:id/messages   发送消息（JSON body，返回 { ok }）
 *   GET    /session/:id/messages   获取会话消息摘要
 *
 * 认证：`Authorization: Bearer <authToken>`。
 *
 * @returns 同步返回 { port, stop }（与调用方 main.tsx 的用法一致）
 */
export function startServer(
  config: ServerConfig,
  sessionManager?: any,
  logger?: ServerLoggerLike | any,
): { port: number; stop: (force?: boolean) => Promise<void> } {
  const log = logger || noopLogger

  const server = createServer(async (req, res) => {
    try {
      // 认证
      if (!isAuthorized(req, config.authToken)) {
        sendJson(res, 401, { error: 'Unauthorized' })
        return
      }

      const url = new URL(req.url || '/', `http://${config.host}:${config.port}`)
      const pathname = url.pathname.replace(/\/+$/, '') || '/'

      // GET /health
      if (req.method === 'GET' && pathname === '/health') {
        sendJson(res, 200, { status: 'ok', pid: process.pid, version: MACRO.VERSION })
        return
      }

      // POST /sessions
      if (req.method === 'POST' && pathname === '/sessions') {
        const body = await readBody(req)
        let parsed: any = {}
        try { parsed = JSON.parse(body) } catch { /* 空 body */ }
        if (!sessionManager || typeof sessionManager.createSession !== 'function') {
          sendJson(res, 500, { error: 'Session manager not available' })
          return
        }
        try {
          const session = await sessionManager.createSession({
            cwd: parsed.cwd || config.workspace || process.cwd(),
            dangerouslySkipPermissions: parsed.dangerously_skip_permissions,
          })
          sendJson(res, 201, {
            session_id: session.id,
            ws_url: `ws://${config.host}:${config.port}/ws/${session.id}`,
            work_dir: session.workDir,
          })
        } catch (e: any) {
          sendJson(res, 400, { error: e.message })
        }
        return
      }

      // GET /sessions
      if (req.method === 'GET' && pathname === '/sessions') {
        const list = sessionManager?.listSessions ? sessionManager.listSessions() : []
        sendJson(res, 200, { sessions: list.map((s: any) => ({ id: s.id, status: s.status, workDir: s.workDir })) })
        return
      }

      // /session/:id/*
      const sessionMatch = pathname.match(/^\/session\/([^/]+)(?:\/(messages))?$/)
      if (sessionMatch) {
        const [, id, sub] = sessionMatch

        // DELETE /session/:id
        if (req.method === 'DELETE' && !sub) {
          await sessionManager?.destroySession?.(id)
          sendJson(res, 200, { ok: true, session_id: id })
          return
        }

        // GET /session/:id
        if (req.method === 'GET' && !sub) {
          const info = sessionManager?.getSession ? sessionManager.getSession(id) : null
          if (!info) {
            sendJson(res, 404, { error: `Session not found: ${id}` })
            return
          }
          sendJson(res, 200, { session: info })
          return
        }

        // POST /session/:id/messages
        if (req.method === 'POST' && sub === 'messages') {
          const body = await readBody(req)
          let message: any = {}
          try { message = JSON.parse(body) } catch { /* 空 body */ }
          if (sessionManager?.sendMessage) {
            await sessionManager.sendMessage(id, message)
          }
          sendJson(res, 200, { ok: true, session_id: id })
          return
        }

        // GET /session/:id/messages
        if (req.method === 'GET' && sub === 'messages') {
          const msgs = sessionManager?.getMessages ? sessionManager.getMessages(id) : []
          sendJson(res, 200, { session_id: id, messages: msgs })
          return
        }
      }

      sendJson(res, 404, { error: `Not found: ${req.method} ${pathname}` })
    } catch (err) {
      log.error('server error:', err)
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
    }
  })

  server.listen(config.port, config.host)
  log.info(`server listening on ${config.host}:${config.port}`)

  return {
    port: config.port,
    stop: async (force?: boolean) => {
      if (force) {
        server.closeAllConnections?.()
      }
      await new Promise<void>(resolve => server.close(() => resolve()))
      log.info('server stopped')
    },
  }
}
