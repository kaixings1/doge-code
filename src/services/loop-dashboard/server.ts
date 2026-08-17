// ============================================================================
// Loop Dashboard Server - Loop 监控面板 Web 服务器
// ============================================================================

import { createServer, type Server } from 'http'
import { getLoopDashboardData } from './api.js'

let server: Server | null = null
let port = 0

// ============================================================================
// HTML Dashboard UI
// ============================================================================

function renderDashboardHTML(data: Awaited<ReturnType<typeof getLoopDashboardData>>): string {
  const m = data.metrics
  const successPct = m.totalLoops > 0 ? (m.successRate * 100).toFixed(1) : '0.0'
  const failPct = m.totalLoops > 0 ? (100 - m.successRate * 100).toFixed(1) : '0.0'

  const activeRows = data.activeLoops.map(a => `
    <tr>
      <td>${a.loopId.slice(0, 16)}</td>
      <td>${a.pattern}</td>
      <td><span class="badge ${a.status}">${a.status}</span></td>
      <td>${a.currentIteration}/${a.maxIterations}</td>
      <td>${Math.round(a.durationMs / 1000)}s</td>
      <td>${a.tokensUsed.toLocaleString()}</td>
    </tr>
  `).join('')

  const recentRows = data.recentLoops.slice(0, 20).map(r => `
    <tr>
      <td>${r.loopId.slice(0, 16)}</td>
      <td>${r.pattern}</td>
      <td><span class="badge ${r.status}">${r.status}</span></td>
      <td>${Math.round(r.durationMs / 1000)}s</td>
      <td>${r.tokensUsed.toLocaleString()}</td>
      <td>${r.successCount}/${r.failureCount}</td>
    </tr>
  `).join('')

  const dlqRows = data.deadLetterQueue.slice(0, 20).map(d => `
    <tr>
      <td>${d.taskId.slice(0, 16)}</td>
      <td>${d.loopId.slice(0, 16)}</td>
      <td>${d.error.slice(0, 40)}</td>
      <td>${d.retries}</td>
      <td><span class="badge ${d.status}">${d.status}</span></td>
      <td>${new Date(d.createdAt).toLocaleString('zh-CN')}</td>
    </tr>
  `).join('')

  const patternBars = Object.entries(m.patterns).map(([pattern, count]) => {
    const pct = m.totalLoops > 0 ? ((count / m.totalLoops) * 100).toFixed(1) : '0'
    return `<div style="margin:4px 0"><span style="display:inline-block;width:120px">${pattern}</span><div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div><span style="font-size:11px;color:#8b949e">${count} (${pct}%)</span></div>`
  }).join('')

  const sh = data.systemHealth

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Loop V2 Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; padding: 20px; }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { color: #58a6ff; margin-bottom: 20px; font-size: 24px; }
    h2 { color: #8b949e; margin: 20px 0 10px; font-size: 16px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin-bottom: 30px; }
    .stat-card { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 15px; }
    .stat-card .label { color: #8b949e; font-size: 12px; margin-bottom: 5px; }
    .stat-card .value { color: #58a6ff; font-size: 22px; font-weight: 600; }
    .stat-card .sub { color: #8b949e; font-size: 11px; margin-top: 5px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #30363d; font-size: 13px; }
    th { color: #8b949e; font-weight: 600; }
    .cost { color: #3fb950; }
    .tokens { color: #d2a8ff; }
    .badge { padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
    .badge.running { background: #1f6feb33; color: #58a6ff; }
    .badge.completed { background: #23863633; color: #3fb950; }
    .badge.failed { background: #da363333; color: #f85149; }
    .badge.pending { background: #d2992233; color: #d29922; }
    .badge.dead-letter { background: #da363333; color: #f85149; }
    .bar { height: 6px; background: #30363d; border-radius: 3px; margin-top: 5px; overflow: hidden; }
    .bar-fill { height: 100%; background: #58a6ff; border-radius: 3px; }
    .refresh { color: #8b949e; font-size: 11px; margin-top: 20px; text-align: center; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔄 Loop V2 — 监控面板</h1>

    <h2>📊 指标总览</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="label">总循环数</div>
        <div class="value">${m.totalLoops}</div>
        <div class="sub">✅ ${m.successCount} / ❌ ${m.failureCount}</div>
      </div>
      <div class="stat-card">
        <div class="label">成功率</div>
        <div class="value cost">${successPct}%</div>
        <div class="sub">失败率 ${failPct}%</div>
      </div>
      <div class="stat-card">
        <div class="label">平均耗时</div>
        <div class="value">${Math.round(m.avgDurationMs / 1000)}s</div>
      </div>
      <div class="stat-card">
        <div class="label">Token 消耗</div>
        <div class="value tokens">${m.totalTokens.toLocaleString()}</div>
      </div>
      <div class="stat-card">
        <div class="label">成本估算</div>
        <div class="value cost">$${m.totalCost.toFixed(4)}</div>
      </div>
      <div class="stat-card">
        <div class="label">活跃循环</div>
        <div class="value">${data.activeLoops.length}</div>
      </div>
    </div>

    <h2>📈 模式分布</h2>
    <div class="stat-card" style="margin-bottom:20px">${patternBars || '<div style="color:#8b949e;font-size:13px">暂无数据</div>'}</div>

    <div class="grid-2">
      <div>
        <h2>🔄 活跃循环</h2>
        <div style="overflow-x:auto">
          <table>
            <thead><tr><th>Loop ID</th><th>Pattern</th><th>Status</th><th>Iter</th><th>耗时</th><th>Tokens</th></tr></thead>
            <tbody>${activeRows || '<tr><td colspan="6" style="color:#8b949e">暂无活跃循环</td></tr>'}</tbody>
          </table>
        </div>
      </div>

      <div>
        <h2>📜 最近循环</h2>
        <div style="overflow-x:auto">
          <table>
            <thead><tr><th>Loop ID</th><th>Pattern</th><th>Status</th><th>耗时</th><th>Tokens</th><th>成功/失败</th></tr></thead>
            <tbody>${recentRows || '<tr><td colspan="6" style="color:#8b949e">暂无历史</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>

    <h2>⚠️ 死信队列 (${data.deadLetterQueue.length})</h2>
    <div style="overflow-x:auto">
      <table>
        <thead><tr><th>Task ID</th><th>Loop ID</th><th>Error</th><th>Retries</th><th>Status</th><th>Created</th></tr></thead>
        <tbody>${dlqRows || '<tr><td colspan="6" style="color:#8b949e">空队列</td></tr>'}</tbody>
      </table>
    </div>

    <h2>🖥️ 系统健康</h2>
    <div class="stats-grid">
      <div class="stat-card"><div class="label">CPU 核心</div><div class="value">${sh.cpu}</div></div>
      <div class="stat-card"><div class="label">内存使用率</div><div class="value">${sh.memory}%</div></div>
      <div class="stat-card"><div class="label">磁盘剩余 (C:)</div><div class="value">${sh.diskFreeGB} GB</div></div>
      <div class="stat-card"><div class="label">检查点</div><div class="value">${sh.checkpointCount}</div></div>
      <div class="stat-card"><div class="label">死信条目</div><div class="value">${sh.deadLetterCount}</div></div>
      <div class="stat-card"><div class="label">锁状态</div><div class="value">${sh.lockStatus}</div></div>
    </div>

    <p class="refresh">数据生成时间: ${new Date(data.generatedAt).toLocaleString('zh-CN')} | 每 30 秒自动刷新</p>
  </div>

  <script>setInterval(() => location.reload(), 30000)</script>
</body>
</html>`
}

// ============================================================================
// Server
// ============================================================================

export function startLoopDashboardServer(preferredPort = 3711): Promise<number> {
  return new Promise((resolve, reject) => {
    if (server) {
      resolve(port)
      return
    }

    server = createServer(async (req, res) => {
      const url = req.url || '/'

      try {
        if (url === '/' || url === '/index.html') {
          const data = await getLoopDashboardData()
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(renderDashboardHTML(data))
        } else if (url === '/api/loop-dashboard') {
          const data = await getLoopDashboardData()
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(data))
        } else if (url === '/api/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }))
        } else {
          res.writeHead(404)
          res.end('Not Found')
        }
      } catch {
        res.writeHead(500)
        res.end('Internal Server Error')
      }
    })

    server.listen(preferredPort, '127.0.0.1', () => {
      port = (server?.address() as any)?.port || preferredPort
      console.log(`[LoopDashboard] Server started on http://127.0.0.1:${port}`)
      resolve(port)
    })

    server.on('error', (err) => {
      console.error('[LoopDashboard] Server error:', err)
      reject(err)
    })
  })
}

export function stopLoopDashboardServer(): void {
  if (server) {
    server.close()
    server = null
    port = 0
  }
}

export function getLoopDashboardPort(): number {
  return port
}

export function isLoopDashboardRunning(): boolean {
  return server !== null
}
