import { type Tool } from '../../engine/types.js'
import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { createServer, type Server } from 'http'

const SUBSCRIPTIONS_FILE = join(homedir(), '.doge', 'pr-subscriptions.json')

interface WebhookEventRecord {
  timestamp: string
  repo: string
  pr: number
  action: string
  state: string
}

export class SubscribePRTool implements Tool {
  name = 'subscribe_pr'
  description = 'Subscribe to GitHub PR status changes with state tracking, check PR details, poll for changes, and receive real-time webhook push events'
  parameters = {
    type: 'object' as const,
    properties: {
      action: { type: 'string', description: 'Action: check, list, subscribe, unsubscribe, poll, webhook-start, webhook-stop, webhook-status, or webhook-events', enum: ['check', 'list', 'subscribe', 'unsubscribe', 'poll', 'webhook-start', 'webhook-stop', 'webhook-status', 'webhook-events'] },
      repo: { type: 'string', description: 'Repository in format owner/repo' },
      pr: { type: 'number', description: 'PR number' },
      port: { type: 'number', description: 'Port for webhook server (default 45679)' },
      limit: { type: 'number', description: 'Max events to show for webhook-events (default 20, max 100)' }
    },
    required: ['action']
  }
  validate = () => ({ valid: true })

  // ─── Webhook 服务器状态（D2：实时推送） ───
  private webhookServer: Server | null = null
  private webhookPort = 45679
  private webhookEvents: WebhookEventRecord[] = []

  /** 订阅存储路径 */
  private subscriptionsFile(): string {
    return SUBSCRIPTIONS_FILE
  }

  private loadSubscriptions(): Array<{ repo: string; pr: number; lastState?: string; lastTitle?: string }> {
    try {
      if (!existsSync(this.subscriptionsFile())) return []
      return JSON.parse(readFileSync(this.subscriptionsFile(), 'utf-8'))
    } catch { return [] }
  }

  private saveSubscriptions(subs: Array<{ repo: string; pr: number; lastState?: string; lastTitle?: string }>): void {
    try {
      const dir = dirname(this.subscriptionsFile())
      if (dir) mkdirSync(dir, { recursive: true })
      writeFileSync(this.subscriptionsFile(), JSON.stringify(subs, null, 2), 'utf-8')
    } catch { /* ignore */ }
  }

  /** 获取 PR 状态（含 reviews/mergeable） */
  private fetchPRState(repo: string, pr: number): { state: string; title: string; mergeable?: string; reviews?: number; changed?: boolean } | null {
    try {
      const output = execSync(`gh pr view ${pr} --repo ${repo} --json state,title,mergeable,reviews 2>&1`, { encoding: 'utf-8', timeout: 15000 })
      const data = JSON.parse(output)
      return {
        state: data.state,
        title: data.title,
        mergeable: data.mergeable || 'unknown',
        reviews: data.reviews?.length || 0,
      }
    } catch { return null }
  }

  // ─── Webhook 实时推送（D2） ───

  /** 启动本地 webhook 服务器（接收 GitHub pull_request 事件） */
  private startWebhookServer(port: number): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.webhookServer) {
        resolve(`Webhook server already running on port ${this.webhookPort}`)
        return
      }
      const server = createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/webhook') {
          let body = ''
          req.on('data', (chunk) => { body += chunk })
          req.on('end', () => {
            try {
              const eventName = String(req.headers['x-github-event'] || 'push')
              const payload = JSON.parse(body)
              const handled = this.handleWebhookEvent(eventName, payload)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: true, handled }))
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e)
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: msg }))
            }
          })
        } else {
          res.writeHead(200, { 'Content-Type': 'text/plain' })
          res.end('Doge Code PR webhook listener. Configure GitHub webhook to POST /webhook (X-GitHub-Event: pull_request).')
        }
      })
      server.on('error', (err) => {
        reject(`Webhook server error: ${err.message}`)
      })
      server.listen(port, () => {
        this.webhookServer = server
        this.webhookPort = port
        resolve(`Webhook server listening on port ${port} (POST /webhook)`)
      })
    })
  }

  /** 停止 webhook 服务器 */
  private stopWebhookServer(): Promise<string> {
    return new Promise((resolve) => {
      if (!this.webhookServer) {
        resolve('Webhook server is not running.')
        return
      }
      const server = this.webhookServer
      server.close(() => {
        if (this.webhookServer === server) this.webhookServer = null
        resolve('Webhook server stopped.')
      })
    })
  }

  /** 处理 GitHub webhook 事件：更新订阅状态 + 记录事件 */
  private handleWebhookEvent(eventName: string, payload: any): boolean {
    if (eventName !== 'pull_request') return false
    const repo = payload?.repository?.full_name
    const pr = payload?.number ?? payload?.pull_request?.number
    const action = payload?.action || 'unknown'
    const prData = payload?.pull_request || {}
    const merged = !!prData.merged
    const state = merged ? 'merged' : (prData.state || 'unknown')
    if (!repo || pr == null) return false

    // 记录事件（最多 100 条）
    this.webhookEvents.push({ timestamp: new Date().toISOString(), repo, pr, action, state })
    if (this.webhookEvents.length > 100) this.webhookEvents = this.webhookEvents.slice(-100)

    // 更新订阅状态（实时推送变化）
    const subs = this.loadSubscriptions()
    const sub = subs.find(s => s.repo === repo && s.pr === pr)
    if (sub) {
      sub.lastState = state
      if (prData.title) sub.lastTitle = prData.title
      this.saveSubscriptions(subs)
      return true
    }
    return false
  }

  /** 格式化 webhook 事件列表 */
  private formatWebhookEvents(limit: number): string {
    const events = this.webhookEvents.slice(-limit).reverse()
    const lines = ['## Webhook Events', '']
    if (events.length === 0) {
      lines.push('No events received yet.')
      lines.push('Configure a GitHub webhook to POST to http://<host>:<port>/webhook (event: pull_request).')
    } else {
      events.forEach(e => lines.push(`- ${e.timestamp} #${e.pr} in ${e.repo}: ${e.action} -> ${e.state}`))
    }
    return lines.join('\n')
  }

  execute = async (params: Record<string, any>) => {
    const action = params?.action || 'list'
    const repo = params?.repo || ''
    const pr = params?.pr || 0

    if (action === 'subscribe' && repo && pr) {
      const subs = this.loadSubscriptions()
      const existing = subs.find(s => s.repo === repo && s.pr === pr)
      const state = this.fetchPRState(repo, pr)
      if (!existing) {
        subs.push({ repo, pr, lastState: state?.state, lastTitle: state?.title })
      } else {
        existing.lastState = state?.state
        existing.lastTitle = state?.title
      }
      this.saveSubscriptions(subs)
      const lines = ['## Subscribed', '', `- #${pr} in ${repo}`, '', `Subscriptions: ${subs.length}`]
      if (state) lines.push('', `**Current State:** ${state.state} - ${state.title}`)
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    }

    if (action === 'unsubscribe' && repo && pr) {
      const subs = this.loadSubscriptions()
      const filtered = subs.filter(s => !(s.repo === repo && s.pr === pr))
      this.saveSubscriptions(filtered)
      return { content: [{ type: 'text', text: `Unsubscribed from #${pr} in ${repo}. Remaining: ${filtered.length}` }] }
    }

    if (action === 'poll') {
      const subs = this.loadSubscriptions()
      if (subs.length === 0) return { content: [{ type: 'text', text: 'No subscriptions to poll. Use subscribe action first.' }] }
      const changes: string[] = []
      const lines = ['## Poll Results', '']
      for (const s of subs) {
        const state = this.fetchPRState(s.repo, s.pr)
        if (!state) { lines.push(`- #${s.pr} in ${s.repo}: [error fetching]`); continue }
        const changed = s.lastState !== state.state || (s.lastTitle && s.lastTitle !== state.title)
        lines.push(`- #${s.pr} in ${s.repo}: ${state.state}${changed ? ' ⚠️ CHANGED' : ''}`)
        if (changed && s.lastState) changes.push(`#${s.pr} in ${s.repo}: ${s.lastState} -> ${state.state}`)
        // 更新跟踪状态
        s.lastState = state.state
        s.lastTitle = state.title
      }
      this.saveSubscriptions(subs)
      if (changes.length > 0) {
        lines.push('', '### Changes Detected', '')
        changes.forEach(c => lines.push(`- ${c}`))
      } else {
        lines.push('', 'No state changes detected.')
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    }

    if (action === 'list' && !repo) {
      const subs = this.loadSubscriptions()
      if (subs.length === 0) return { content: [{ type: 'text', text: 'No subscriptions. Use subscribe action with repo and pr.' }] }
      const lines = ['## Subscribed PRs', '']
      for (const s of subs) {
        try {
          const output = execSync(`gh pr view ${s.pr} --repo ${s.repo} --json number,title,state 2>&1`, { encoding: 'utf-8', timeout: 15000 })
          const data = JSON.parse(output)
          lines.push(`- #${data.number}: ${data.title} [${data.state}]`)
        } catch {
          lines.push(`- #${s.pr} in ${s.repo} [unknown]`)
        }
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    }

    if (action === 'check' && repo && pr) {
      try {
        const output = execSync(`gh pr view ${pr} --repo ${repo} --json title,state,author,createdAt,mergeable,reviews,additions,deletions,files 2>&1`, { encoding: 'utf-8', timeout: 15000 })
        const data = JSON.parse(output)
        const lines = ['## PR Details', '', `**PR #${pr}:** ${data.title}`, `**State:** ${data.state}`, `**Author:** ${data.author?.login || 'unknown'}`, `**Created:** ${data.createdAt}`, `**Mergeable:** ${data.mergeable || 'unknown'}`, `**Changes:** +${data.additions} / -${data.deletions}`, `**Files Changed:** ${data.files?.length || 0}`, `**Reviews:** ${data.reviews?.length || 0}`]
        return { content: [{ type: 'text', text: lines.join('\n') }] }
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Error fetching PR: ${err.message}` }] }
      }
    }
    if (action === 'list' && repo) {
      try {
        const output = execSync(`gh pr list --repo ${repo} --state open --limit 10 --json number,title,author,createdAt,headRefName 2>&1`, { encoding: 'utf-8', timeout: 15000 })
        const prs = JSON.parse(output)
        if (prs.length === 0) return { content: [{ type: 'text', text: 'No open PRs found.' }] }
        const lines = ['## Open PRs', '']
        prs.forEach((p: any) => lines.push(`- #${p.number}: ${p.title} (${p.author?.login || 'unknown'})`))
        return { content: [{ type: 'text', text: lines.join('\n') }] }
      } catch (err: any) {
        return { content: [{ type: 'text', text: `Error listing PRs: ${err.message}` }] }
      }
    }

    if (action === 'webhook-start') {
      const port = params?.port || 45679
      try {
        const msg = await this.startWebhookServer(port)
        const lines = ['## Webhook Server Started', '', msg, '', 'GitHub setup: Settings -> Webhooks -> Add webhook', '  Payload URL: http://<your-host>:' + port + '/webhook', '  Content type: application/json', '  Events: Pull requests']
        return { content: [{ type: 'text', text: lines.join('\n') }] }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return { content: [{ type: 'text', text: 'Error: ' + msg }] }
      }
    }

    if (action === 'webhook-stop') {
      const msg = await this.stopWebhookServer()
      return { content: [{ type: 'text', text: msg }] }
    }

    if (action === 'webhook-status') {
      const lines = ['## Webhook Server', '']
      if (!this.webhookServer) {
        lines.push('Status: **stopped**')
        lines.push('')
        lines.push('Start with action=webhook-start port=<port>')
      } else {
        lines.push('Status: **running**')
        lines.push(`Port: ${this.webhookPort}`)
        lines.push(`Endpoint: POST http://<host>:${this.webhookPort}/webhook`)
        lines.push(`Events received: ${this.webhookEvents.length}`)
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    }

    if (action === 'webhook-events') {
      const limit = Math.min(params?.limit || 20, 100)
      return { content: [{ type: 'text', text: this.formatWebhookEvents(limit) }] }
    }

    return { content: [{ type: 'text', text: 'Usage: subscribe_pr with action=check repo=owner/repo pr=123' }] }
  }
}
