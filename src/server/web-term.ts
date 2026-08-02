/**
 * Local Web Terminal Bridge — 本地浏览器终端桥接
 *
 * 启动一个 WebSocket 服务器，在浏览器中通过 xterm.js 提供交互式终端。
 * 无需 Anthropic CCR 服务端，完全本地运行。
 *
 * 使用：bun run src/server/web-term.ts
 * 然后浏览器打开 http://localhost:3210
 */

import { ServerWebSocket } from 'bun'
import * as os from 'os'

const PORT = 3210

// ANSI escape sequence buffer for incremental parsing
let ansiBuffer = ''
let ws: ServerWebSocket | null = null
let childProcess: BunSubprocess | null = null

function buildHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Doge Code — Local Web Terminal</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1a1a2e; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif; }
  #terminal-container { width: 95vw; height: 92vh; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.4); }
  .header { position: fixed; top: 8px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.6); color: #888; padding: 4px 16px; border-radius: 4px; font-size: 12px; z-index: 10; }
  .header span { color: #4ade80; }
</style>
</head>
<body>
<div class="header">Doge Code Web Terminal &mdash; <span id="status">connecting...</span></div>
<div id="terminal-container"></div>
<script>
const statusEl = document.getElementById('status');
const container = document.getElementById('terminal-container');

const term = new Terminal({
  cursorBlink: true,
  cursorStyle: 'bar',
  scrollback: 5000,
  fontSize: 14,
  fontFamily: "'Cascadia Code','Fira Code','Consolas','Monaco',monospace",
  lineHeight: 1.3,
  theme: {
    background: '#0d1117',
    foreground: '#c9d1d9',
    cursor: '#58a6ff',
    cursorAccent: '#0d1117',
    selection: '#264f78',
    black: '#484f58',
    red: '#ff7b72',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#bc8cff',
    cyan: '#39c5cf',
    white: '#b1bac4',
    brightBlack: '#6e7681',
    brightRed: '#ffa198',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#f0f6fc'
  }
});
term.open(container);

const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(protocol + '//' + location.host);
ws.binaryType = 'arraybuffer';

ws.onopen = () => { statusEl.textContent = 'connected'; statusEl.style.color = '#4ade80'; };
ws.onclose = () => { statusEl.textContent = 'disconnected'; statusEl.style.color = '#ff7b72'; };
ws.onerror = () => { statusEl.textContent = 'error'; statusEl.style.color = '#ff7b72'; };

term.onData(data => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'input', data }));
});
term.onResize(size => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'resize', cols: size.cols, rows: size.rows }));
});

setTimeout(() => {
  ws.send(JSON.stringify({ type: 'resize', cols: 120, rows: 36 }));
}, 500);

ws.onmessage = (event) => {
  const data = new Uint8Array(event.data);
  const text = new TextDecoder().decode(data);
  term.write(text);
};
</script>
</body>
</html>`
}

// ANSI escape sequence parser
function parseAnsi(buffer: string): string[] {
  const chunks: string[] = []
  let i = 0
  const len = buffer.length

  while (i < len) {
    const ch = buffer.charCodeAt(i)

    if (ch === 0x1B && i + 1 < len) {
      const next = buffer.charCodeAt(i + 1)

      if (next === 0x5B) {
        // CSI sequence: ESC [ ... (letter|intermediate)
        let j = i + 2
        // Skip params (digits, semicolons)
        while (j < len) {
          const c = buffer.charCodeAt(j)
          if ((c >= 0x30 && c <= 0x3F)) { j++ } else break // 0-9 ; < = > ?
        }
        // Skip intermediates
        while (j < len) {
          const c = buffer.charCodeAt(j)
          if (c >= 0x20 && c <= 0x2F) { j++ } else break
        }
        // Final byte
        if (j < len) j++
        chunks.push(buffer.slice(i, j))
        i = j
      } else if (next === 0x50) {
        // DCS sequence: ESC P ... ST
        let j = i + 2
        while (j < len - 1) {
          if (buffer.charCodeAt(j) === 0x1B && buffer.charCodeAt(j + 1) === 0x5C) {
            j += 2
            break
          }
          j++
        }
        chunks.push(buffer.slice(i, j))
        i = j
      } else if (next === 0x5D) {
        // OSC sequence: ESC ] ... ST (BEL or ESC \)
        let j = i + 2
        while (j < len - 1) {
          if ((buffer.charCodeAt(j) === 0x07) ||
              (buffer.charCodeAt(j) === 0x1B && buffer.charCodeAt(j + 1) === 0x5C)) {
            j += (buffer.charCodeAt(j) === 0x07) ? 1 : 2
            break
          }
          j++
        }
        chunks.push(buffer.slice(i, j))
        i = j
      } else {
        // Simple 2-byte escape sequence
        chunks.push(buffer.slice(i, i + 2))
        i += 2
      }
    } else {
      // Regular UTF-8 character
      let j = i + 1
      while (j < len) {
        const c = buffer.charCodeAt(j)
        if ((c & 0xC0) === 0x80) j++
        else break
      }
      chunks.push(buffer.slice(i, j))
      i = j
    }
  }

  return chunks
}

function sendAnsiData(text: string) {
  if (!ws || ws.readyState !== 1) return // 1 = OPEN
  ansiBuffer += text
  const chunks = parseAnsi(ansiBuffer)
  if (chunks.length === 0) return

  const encoder = new TextEncoder()
  const blob = new Blob(chunks.map(c => encoder.encode(c)), { type: 'application/octet-stream' })
  ws.sendBlob(blob)

  const lastChunk = chunks[chunks.length - 1]
  ansiBuffer = ansiBuffer.endsWith(lastChunk) ? '' : ''
}

async function main() {
  const platform = os.platform()
  const shell = platform === 'win32' ? 'cmd.exe' : (process.env.SHELL || '/bin/sh')
  const shellArgs = platform === 'win32' ? [] : ['-l']

  console.log(`[web-term] Spawning process: ${shell} ${shellArgs.join(' ')}`)

  // Enable virtual terminal processing on Windows for ANSI escape support
  const env: Record<string, string> = {
    ...process.env,
    TERM: 'xterm-256color',
  }
  if (platform === 'win32') {
    env['ANSICON'] = '1'
    env['ConEmuANSI'] = 'ON'
    env['TERM_PROGRAM'] = 'vscode'
  }

  // Spawn child process using Bun.spawn (no node-pty dependency)
  childProcess = Bun.spawn([shell, ...shellArgs], {
    cwd: process.cwd(),
    env,
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'inherit',
  })

  // Pipe stdout → WebSocket (batch every 8ms for smooth rendering)
  let flushTimer: ReturnType<typeof setInterval> | null = null
  let pending = ''

  // Read stdout as text using ReadableStream
  const reader = childProcess.stdout.getReader()
  ;(async () => {
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        // value is Uint8Array, decode to string
        const text = new TextDecoder().decode(value)
        pending += text
        if (!flushTimer) {
          flushTimer = setInterval(() => {
            if (pending) {
              sendAnsiData(pending)
              pending = ''
            }
            flushTimer = null
          }, 8)
        }
      }
    } catch { /* ignore */ }
  })()

  // Handle process exit
  const exitCode = await childProcess.exited
  console.log(`[web-term] Process exited: code=${exitCode}`)
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'exit', code: exitCode ?? 0 }))
  }
  cleanup()

  // Create WebSocket server
  const server = Bun.serve<{ ws?: ServerWebSocket }>({
    port: PORT,
    fetch(req, server) {
      const url = new URL(req.url)

      if (url.pathname === '/' || url.pathname === '/index.html') {
        return new Response(buildHtml(), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }

      if (url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response('Not Found', { status: 404 })
    },

    websocket: {
      open(ws) {
        console.log('[web-term] WebSocket connected')
        ;(server.data as any).ws = ws
        ws = ws
        ansiBuffer = ''
      },

      message(ws, message) {
        try {
          const msg = JSON.parse(message as string)

          switch (msg.type) {
            case 'input':
              if (childProcess && !childProcess.killed) {
                // Write input to stdin
                const encoder = new TextEncoder()
                childProcess.stdin?.write(encoder.encode(msg.data))
              }
              break

            case 'ping':
              ws.send(JSON.stringify({ type: 'pong' }))
              break
          }
        } catch {
          // Binary data or non-JSON — ignore
        }
      },

      close() {
        console.log('[web-term] WebSocket disconnected')
        cleanup()
      },
    },
  })

  // Cleanup handler
  process.on('SIGINT', () => { cleanup(); process.exit(0) })
  process.on('SIGTERM', () => { cleanup(); process.exit(0) })

  function cleanup() {
    try { childProcess?.kill() } catch { /* ignore */ }
    childProcess = null
    ws = null
    ansiBuffer = ''
  }

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           Doge Code — Local Web Terminal Bridge             ║
╠══════════════════════════════════════════════════════════════╣
║  Local:   http://localhost:${PORT}                            ║
║  LAN:     http://<your-ip>:${PORT}                           ║
╠══════════════════════════════════════════════════════════════╣
║  Ctrl+C 在此终端中停止服务器                                 ║
╚══════════════════════════════════════════════════════════════╝
  `)

  // Try to show LAN IP
  try {
    const interfaces = os.networkInterfaces()
    for (const [name, addrs] of Object.entries(interfaces)) {
      for (const addr of addrs!) {
        if (addr.family === 'IPv4' && !addr.internal) {
          console.log(`  [${name}] http://${addr.address}:${PORT}`)
        }
      }
    }
  } catch { /* ignore */ }
}

main().catch((err) => {
  console.error('[web-term] Fatal error:', err)
  process.exit(1)
})
