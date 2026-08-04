// ============================================================================
// Dashboard Server - 仪表盘 Web 服务器
// 提供 HTTP API 和静态文件服务
// ===========================================================================

import { createServer, type Server } from 'http'
import { join } from 'path'
import { getDashboardData } from './api.js'

let server: Server | null = null
let port = 0

// ============================================================================
// HTML Dashboard UI
// ===========================================================================

function renderDashboardHTML(data: ReturnType<typeof getDashboardData>): string {
  const { stats, modelUsage, dailyUsage } = data
  const totalTokens = stats.totalTokens.input + stats.totalTokens.output

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Doge Code - 用量仪表盘</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #58a6ff; margin-bottom: 20px; font-size: 24px; }
    h2 { color: #8b949e; margin: 20px 0 10px; font-size: 16px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 30px; }
    .stat-card { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 15px; }
    .stat-card .label { color: #8b949e; font-size: 12px; margin-bottom: 5px; }
    .stat-card .value { color: #58a6ff; font-size: 24px; font-weight: 600; }
    .stat-card .sub { color: #8b949e; font-size: 11px; margin-top: 5px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #30363d; font-size: 13px; }
    th { color: #8b949e; font-weight: 600; }
    .cost { color: #3fb950; }
    .tokens { color: #d2a8ff; }
    .refresh { color: #8b949e; font-size: 11px; margin-top: 20px; text-align: center; }
    .bar { height: 4px; background: #30363d; border-radius: 2px; margin-top: 5px; overflow: hidden; }
    .bar-fill { height: 100%; background: #58a6ff; border-radius: 2px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🐕 Doge Code - 用量仪表盘</h1>

    <h2>📊 总体统计</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="label">总费用</div>
        <div class="value cost">$${stats.totalCostUSD.toFixed(4)}</div>
        <div class="sub">USD</div>
      </div>
      <div class="stat-card">
        <div class="label">总 Token</div>
        <div class="value tokens">${totalTokens.toLocaleString()}</div>
        <div class="sub">输入 ${stats.totalTokens.input.toLocaleString()} / 输出 ${stats.totalTokens.output.toLocaleString()}</div>
      </div>
      <div class="stat-card">
        <div class="label">缓存命中</div>
        <div class="value">${stats.totalTokens.cacheRead.toLocaleString()}</div>
        <div class="sub">节省 $${((stats.totalTokens.cacheRead * 0.000001) || 0).toFixed(4)}</div>
      </div>
      <div class="stat-card">
        <div class="label">代码变更</div>
        <div class="value">${stats.totalLinesAdded + stats.totalLinesRemoved}</div>
        <div class="sub">+${stats.totalLinesAdded} / -${stats.totalLinesRemoved}</div>
      </div>
      <div class="stat-card">
        <div class="label">总时长</div>
        <div class="value">${(stats.totalDuration / 1000).toFixed(0)}s</div>
        <div class="sub">运行时间</div>
      </div>
      <div class="stat-card">
        <div class="label">网络搜索</div>
        <div class="value">${stats.totalWebSearchRequests}</div>
        <div class="sub">次请求</div>
      </div>
    </div>

    <h2>🤖 按模型统计</h2>
    <table>
      <thead>
        <tr><th>模型</th><th>输入 Token</th><th>输出 Token</th><th>费用 (USD)</th><th>占比</th></tr>
      </thead>
      <tbody>
        ${modelUsage.map(m => {
          const mTotal = m.inputTokens + m.outputTokens
          const pct = totalTokens > 0 ? (mTotal / totalTokens * 100).toFixed(1) : '0'
          return `<tr>
            <td>${m.model}</td>
            <td>${m.inputTokens.toLocaleString()}</td>
            <td>${m.outputTokens.toLocaleString()}</td>
            <td class="cost">$${m.costUSD.toFixed(4)}</td>
            <td><div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div></td>
          </tr>`
        }).join('')}
      </tbody>
    </table>

    <p class="refresh">数据生成时间: ${new Date(data.generatedAt).toLocaleString('zh-CN')} | 每 30 秒自动刷新</p>
  </div>

  <script>
    setInterval(() => location.reload(), 30000)
  </script>
</body>
</html>`
}

// ============================================================================
// Server
// ============================================================================

export function startDashboardServer(preferredPort = 3456): Promise<number> {
  return new Promise((resolve, reject) => {
    if (server) {
      resolve(port)
      return
    }

    server = createServer((req, res) => {
      const url = req.url || '/'

      if (url === '/' || url === '/index.html') {
        const data = getDashboardData()
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(renderDashboardHTML(data))
      } else if (url === '/api/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(getDashboardData()))
      } else if (url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }))
      } else {
        res.writeHead(404)
        res.end('Not Found')
      }
    })

    server.listen(preferredPort, '127.0.0.1', () => {
      port = (server?.address() as any)?.port || preferredPort
      console.log(`[Dashboard] Server started on http://127.0.0.1:${port}`)
      resolve(port)
    })

    server.on('error', (err) => {
      console.error('[Dashboard] Server error:', err)
      reject(err)
    })
  })
}

export function stopDashboardServer(): void {
  if (server) {
    server.close()
    server = null
    port = 0
  }
}

export function getDashboardPort(): number {
  return port
}

export function isDashboardRunning(): boolean {
  return server !== null
}
