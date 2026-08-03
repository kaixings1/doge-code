/* eslint-disable eslint-plugin-n/no-unsupported-features/node-builtins */
/**
 * 用于 CCR upstreamproxy 的 CONNECT-over-WebSocket 中继。
 *
 * 监听 localhost TCP，接受来自 curl/gh/kubectl 等的 HTTP CONNECT 请求，
 * 并通过 WebSocket 将字节隧道传输到 CCR upstreamproxy 端点。
 * CCR 服务器端终止隧道，进行 TLS 中间人攻击，注入组织配置的
 * 凭据（例如 DD-API-KEY），并转发到真正的上游。
 *
 * 为什么使用 WebSocket 而非原始 CONNECT：CCR 入口是带有路径前缀
 * 路由的 GKE L7；cdk-constructs 中没有 connect_matcher。会话入口
 * 隧道（sessions/tunnel/v1alpha/tunnel.proto）已经使用了此模式。
 *
 * 协议：字节被包装在 UpstreamProxyChunk protobuf 消息中
 * （`message UpstreamProxyChunk { bytes data = 1; }`），以便与
 * 服务器端的 gateway.NewWebSocketStreamAdapter 兼容。
 */

import { createServer, type Socket as NodeSocket } from 'node:net'
import { logForDebugging } from '../utils/debug.js'
import { getWebSocketTLSOptions } from '../utils/mtls.js'
import { getWebSocketProxyAgent, getWebSocketProxyUrl } from '../utils/proxy.js'

// CCR 容器运行在出口网关之后 — 直接出站被阻止，
// 因此 WS 升级必须经过所有其他流量使用的同一 HTTP CONNECT 代理。
// undici 的 globalThis.WebSocket 在升级时不查询全局 dispatcher，
// 因此在 Node 下我们使用 ws 包并显式指定代理（与 SessionsWebSocket 相同模式）。
// Bun 的原生 WebSocket 直接接受代理 URL。在 startNodeRelay 中预加载，
// 以便 openTunnel 保持同步且 CONNECT 状态机不会发生竞态。
type WSCtor = typeof import('ws').default
let nodeWSCtor: WSCtor | undefined

// openTunnel 触及的表面交集。undici 的 globalThis.WebSocket 和 ws 包
// 都通过属性风格的 onX 处理器满足此接口。
type WebSocketLike = Pick<
  WebSocket,
  | 'onopen'
  | 'onmessage'
  | 'onerror'
  | 'onclose'
  | 'send'
  | 'close'
  | 'readyState'
  | 'binaryType'
>

// Envoy 的每请求缓冲区上限。第一周的 Datadog 负载不会达到此值，
// 但按此设计以便 git-push 不需要重写中继。
const MAX_CHUNK_BYTES = 512 * 1024

// Sidecar 空闲超时是 50 秒；在此范围内进行 ping。
const PING_INTERVAL_MS = 30_000

/**
 * 手动编码 UpstreamProxyChunk protobuf 消息。
 *
 * 对于 `message UpstreamProxyChunk { bytes data = 1; }`，线格式为：
 *   tag = (field_number << 3) | wire_type = (1 << 3) | 2 = 0x0a
 *   后跟 varint 长度，后跟字节。
 *
 * protobufjs 是通用方案；但对于单字段 bytes 消息，
 * 手动编码只需 10 行且避免了热路径中的运行时依赖。
 */
export function encodeChunk(data: Uint8Array): Uint8Array {
  const len = data.length
  // 长度的 varint 编码 — 大多数块只需 1-3 个长度字节
  const varint: number[] = []
  let n = len
  while (n > 0x7f) {
    varint.push((n & 0x7f) | 0x80)
    n >>>= 7
  }
  varint.push(n)
  const out = new Uint8Array(1 + varint.length + len)
  out[0] = 0x0a
  out.set(varint, 1)
  out.set(data, 1 + varint.length)
  return out
}

/**
 * 解码 UpstreamProxyChunk。返回 data 字段，如果格式错误则返回 null。
 * 能够容忍服务器发送零长度块（保持存活语义）。
 */
export function decodeChunk(buf: Uint8Array): Uint8Array | null {
  if (buf.length === 0) return new Uint8Array(0)
  if (buf[0] !== 0x0a) return null
  let len = 0
  let shift = 0
  let i = 1
  while (i < buf.length) {
    const b = buf[i]!
    len |= (b & 0x7f) << shift
    i++
    if ((b & 0x80) === 0) break
    shift += 7
    if (shift > 28) return null
  }
  if (i + len > buf.length) return null
  return buf.subarray(i, i + len)
}

export type UpstreamProxyRelay = {
  port: number
  stop: () => void
}

type ConnState = {
  ws?: WebSocketLike
  connectBuf: Buffer
  pinger?: ReturnType<typeof setInterval>
  // 在 CONNECT 头部之后但在 ws.onopen 触发之前到达的字节。
  // TCP 可以将 CONNECT + ClientHello 合并为一个数据包，并且套接字的
  // 数据回调可能在 WS 握手仍在进行时再次触发。
  // 若没有此缓冲区，这两种情况都会静默丢弃字节。
  pending: Buffer[]
  wsOpen: boolean
  // 一旦服务器的 200 Connection Established 被转发且
  // 隧道正在传输 TLS 后设置。之后，写入明文 502 会
  // 破坏客户端的 TLS 流 —— 只需关闭即可。
  established: boolean
  // WS onerror 总是后跟 onclose；若没有保护，第二个
  // 处理器会对已结束的套接字调用 sock.end()。先调用者获胜。
  closed: boolean
}

/**
 * 最小化的套接字抽象，使 CONNECT 解析器和 WS 隧道管道
 * 不依赖于运行时。实现在内部处理写入背压：
 * Bun 的 sock.write() 执行部分写入并需要显式尾部排队；
 * Node 的 net.Socket 无条件缓冲且从不丢弃字节。
 */
type ClientSocket = {
  write: (data: Uint8Array | string) => void
  end: () => void
}

function newConnState(): ConnState {
  return {
    connectBuf: Buffer.alloc(0),
    pending: [],
    wsOpen: false,
    established: false,
    closed: false,
  }
}

/**
 * 启动中继。返回其绑定的临时端口和停止函数。
 * 可用时使用 Bun.listen，否则使用 Node 的 net.createServer —— CCR
 * 容器在 Node 下运行 CLI，而非 Bun。
 */
export async function startUpstreamProxyRelay(opts: {
  wsUrl: string
  sessionId: string
  token: string
}): Promise<UpstreamProxyRelay> {
  const authHeader =
    'Basic ' + Buffer.from(`${opts.sessionId}:${opts.token}`).toString('base64')
  // WS 升级本身需要认证（proto authn: PRIVATE_API）—— 网关
  // 需要在升级请求上提供 session-ingress JWT，与
  // 隧道化 CONNECT 内部的 Proxy-Authorization 分开。
  const wsAuthHeader = `Bearer ${opts.token}`

  const relay =
    typeof Bun !== 'undefined'
      ? startBunRelay(opts.wsUrl, authHeader, wsAuthHeader)
      : await startNodeRelay(opts.wsUrl, authHeader, wsAuthHeader)

  logForDebugging(`[upstreamproxy] relay listening on 127.0.0.1:${relay.port}`)
  return relay
}

function startBunRelay(
  wsUrl: string,
  authHeader: string,
  wsAuthHeader: string,
): UpstreamProxyRelay {
  // Bun TCP 套接字不会自动缓冲部分写入：sock.write() 返回
  // 实际交给内核的字节数，其余部分会被
  // 静默丢弃。当内核缓冲区填满时，我们将尾部排队并
  // 让 drain 处理器刷新它。每个套接字都有，因为适配器闭包
  // 的生命周期长于单个处理器调用。
  type BunState = ConnState & { writeBuf: Uint8Array[] }

  // eslint-disable-next-line custom-rules/require-bun-typeof-guard -- caller dispatches on typeof Bun
  const server = Bun.listen<BunState>({
    hostname: '127.0.0.1',
    port: 0,
    socket: {
      open(sock) {
        sock.data = { ...newConnState(), writeBuf: [] }
      },
      data(sock, data) {
        const st = sock.data
        const adapter: ClientSocket = {
          write: payload => {
            const bytes =
              typeof payload === 'string'
                ? Buffer.from(payload, 'utf8')
                : payload
            if (st.writeBuf.length > 0) {
              st.writeBuf.push(bytes)
              return
            }
            const n = sock.write(bytes)
            if (n < bytes.length) st.writeBuf.push(bytes.subarray(n))
          },
          end: () => sock.end(),
        }
        handleData(adapter, st, data, wsUrl, authHeader, wsAuthHeader)
      },
      drain(sock) {
        const st = sock.data
        while (st.writeBuf.length > 0) {
          const chunk = st.writeBuf[0]!
          const n = sock.write(chunk)
          if (n < chunk.length) {
            st.writeBuf[0] = chunk.subarray(n)
            return
          }
          st.writeBuf.shift()
        }
      },
      close(sock) {
        cleanupConn(sock.data)
      },
      error(sock, err) {
        logForDebugging(`[upstreamproxy] client socket error: ${err.message}`)
        cleanupConn(sock.data)
      },
    },
  })

  return {
    port: server.port,
    stop: () => server.stop(true),
  }
}

// 导出以便测试可以直接练习 Node 路径 —— 测试运行器是
// Bun，因此 startUpstreamProxyRelay 中的运行时分发总是选择 Bun。
export async function startNodeRelay(
  wsUrl: string,
  authHeader: string,
  wsAuthHeader: string,
): Promise<UpstreamProxyRelay> {
  nodeWSCtor = (await import('ws')).default
  const states = new WeakMap<NodeSocket, ConnState>()

  const server = createServer(sock => {
    const st = newConnState()
    states.set(sock, st)
    // Node 的 sock.write() 在内部缓冲 —— 返回 false 表示背压
    // 但字节已经排队，因此不需要尾部跟踪
    // 以保证正确性。第一周的负载不会给缓冲区带来压力。
    const adapter: ClientSocket = {
      write: payload => {
        sock.write(typeof payload === 'string' ? payload : Buffer.from(payload))
      },
      end: () => sock.end(),
    }
    sock.on('data', data =>
      handleData(adapter, st, data, wsUrl, authHeader, wsAuthHeader),
    )
    sock.on('close', () => cleanupConn(states.get(sock)))
    sock.on('error', err => {
      logForDebugging(`[upstreamproxy] client socket error: ${err.message}`)
      cleanupConn(states.get(sock))
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr === null || typeof addr === 'string') {
        reject(new Error('upstreamproxy: server has no TCP address'))
        return
      }
      resolve({
        port: addr.port,
        stop: () => server.close(),
      })
    })
  })
}

/**
 * 共享的每连接数据处理器。阶段 1 累积 CONNECT 请求；
 * 阶段 2 通过 WS 隧道转发客户端字节。
 */
function handleData(
  sock: ClientSocket,
  st: ConnState,
  data: Buffer,
  wsUrl: string,
  authHeader: string,
  wsAuthHeader: string,
): void {
  // 阶段 1：累积直到看到完整的 CONNECT 请求
  // （由 CRLF CRLF 终止）。curl/gh 在一个数据包中发送此，但
  // 不要假设如此。
  if (!st.ws) {
    st.connectBuf = Buffer.concat([st.connectBuf, data])
    const headerEnd = st.connectBuf.indexOf('\r\n\r\n')
    if (headerEnd === -1) {
      // 防止客户端从不发送 CRLFCRLF。
      if (st.connectBuf.length > 8192) {
        sock.write('HTTP/1.1 400 Bad Request\r\n\r\n')
        sock.end()
      }
      return
    }
    const reqHead = st.connectBuf.subarray(0, headerEnd).toString('utf8')
    const firstLine = reqHead.split('\r\n')[0] ?? ''
    const m = firstLine.match(/^CONNECT\s+(\S+)\s+HTTP\/1\.[01]$/i)
    if (!m) {
      sock.write('HTTP/1.1 405 Method Not Allowed\r\n\r\n')
      sock.end()
      return
    }
    // 存储在 CONNECT 头部之后到达的字节，以便
    // openTunnel 在 WS 打开后可以刷新它们。
    const trailing = st.connectBuf.subarray(headerEnd + 4)
    if (trailing.length > 0) {
      st.pending.push(Buffer.from(trailing))
    }
    st.connectBuf = Buffer.alloc(0)
    openTunnel(sock, st, firstLine, wsUrl, authHeader, wsAuthHeader)
    return
  }
  // 阶段 2：WS 存在。如果尚未打开，则缓冲；ws.onopen 将
  // 刷新。一旦打开，就分块将客户端字节泵送到 WS。
  if (!st.wsOpen) {
    st.pending.push(Buffer.from(data))
    return
  }
  forwardToWs(st.ws, data)
}

function openTunnel(
  sock: ClientSocket,
  st: ConnState,
  connectLine: string,
  wsUrl: string,
  authHeader: string,
  wsAuthHeader: string,
): void {
  // core/websocket/stream.go 从升级请求的 Content-Type 头部
  // 选择 JSON 或 binary-proto（默认为 JSON）。若没有 application/proto，
  // 服务器 protojson.Unmarshals 我们手动编码的二进制块并
  // 静默失败（EOF）。
  const headers = {
    'Content-Type': 'application/proto',
    Authorization: wsAuthHeader,
  }
  let ws: WebSocketLike
  if (nodeWSCtor) {
    ws = new nodeWSCtor(wsUrl, {
      headers,
      agent: getWebSocketProxyAgent(wsUrl),
      ...getWebSocketTLSOptions(),
    }) as unknown as WebSocketLike
  } else {
    ws = new globalThis.WebSocket(wsUrl, {
      // @ts-expect-error — Bun extension; not in lib.dom WebSocket types
      headers,
      proxy: getWebSocketProxyUrl(wsUrl),
      tls: getWebSocketTLSOptions() || undefined,
    })
  }
  ws.binaryType = 'arraybuffer'
  st.ws = ws

  ws.onopen = () => {
    // 第一个块携带 CONNECT 行和 Proxy-Authorization，以便
    // 服务器可以认证隧道并知道目标主机：端口。服务器
    // 通过隧道响应自己的 "HTTP/1.1 200"；我们只需管道传输它。
    const head =
      `${connectLine}\r\n` + `Proxy-Authorization: ${authHeader}\r\n` + `\r\n`
    ws.send(encodeChunk(Buffer.from(head, 'utf8')))
    // 刷新 WS 握手进行时到达的任何内容 ——
    // CONNECT 数据包的尾随字节和在 onopen 之前触发的
    // 任何 data() 回调。
    st.wsOpen = true
    for (const buf of st.pending) {
      forwardToWs(ws, buf)
    }
    st.pending = []
    // 并非所有 WS 实现都暴露 ping()；空块可作为
    // 服务器可以忽略的应用程序级保持存活。
    st.pinger = setInterval(sendKeepalive, PING_INTERVAL_MS, ws)
  }

  ws.onmessage = ev => {
    const raw =
      ev.data instanceof ArrayBuffer
        ? new Uint8Array(ev.data)
        : new Uint8Array(Buffer.from(ev.data))
    const payload = decodeChunk(raw)
    if (payload && payload.length > 0) {
      st.established = true
      sock.write(payload)
    }
  }

  ws.onerror = ev => {
    const msg = 'message' in ev ? String(ev.message) : 'websocket error'
    logForDebugging(`[upstreamproxy] ws error: ${msg}`)
    if (st.closed) return
    st.closed = true
    if (!st.established) {
      sock.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
    }
    sock.end()
    cleanupConn(st)
  }

  ws.onclose = () => {
    if (st.closed) return
    st.closed = true
    sock.end()
    cleanupConn(st)
  }
}

function sendKeepalive(ws: WebSocketLike): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(encodeChunk(new Uint8Array(0)))
  }
}

function forwardToWs(ws: WebSocketLike, data: Buffer): void {
  if (ws.readyState !== WebSocket.OPEN) return
  for (let off = 0; off < data.length; off += MAX_CHUNK_BYTES) {
    const slice = data.subarray(off, off + MAX_CHUNK_BYTES)
    ws.send(encodeChunk(slice))
  }
}

function cleanupConn(st: ConnState | undefined): void {
  if (!st) return
  if (st.pinger) clearInterval(st.pinger)
  if (st.ws && st.ws.readyState <= WebSocket.OPEN) {
    try {
      st.ws.close()
    } catch {
      // 已在关闭中
    }
  }
  st.ws = undefined
}
