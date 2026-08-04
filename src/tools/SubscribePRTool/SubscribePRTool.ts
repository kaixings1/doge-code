import { type Tool } from '../../engine/types.js'
import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const SUBSCRIPTIONS_FILE = join(homedir(), '.doge', 'pr-subscriptions.json')

export class SubscribePRTool implements Tool {
  name = 'subscribe_pr'
  description = 'Subscribe to GitHub PR status changes with state tracking, check PR details, and poll for changes'
  parameters = {
    type: 'object' as const,
    properties: {
      action: { type: 'string', description: 'Action: check, list, subscribe, unsubscribe, or poll', enum: ['check', 'list', 'subscribe', 'unsubscribe', 'poll'] },
      repo: { type: 'string', description: 'Repository in format owner/repo' },
      pr: { type: 'number', description: 'PR number' }
    },
    required: ['action']
  }
  validate = () => ({ valid: true })

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

  execute = async (params: Record<string, any>) => {
    const action = params?.action || 'list'
    const repo = params?.repo || ''
    const pr = params?.pr || 0

    // 持久化订阅管理（含上次状态跟踪）
    const loadSubscriptions = (): Array<{ repo: string; pr: number; lastState?: string; lastTitle?: string }> => {
      try {
        if (!existsSync(SUBSCRIPTIONS_FILE)) return []
        return JSON.parse(readFileSync(SUBSCRIPTIONS_FILE, 'utf-8'))
      } catch { return [] }
    }
    const saveSubscriptions = (subs: Array<{ repo: string; pr: number; lastState?: string; lastTitle?: string }>) => {
      try {
        const dir = SUBSCRIPTIONS_FILE.substring(0, SUBSCRIPTIONS_FILE.lastIndexOf('\\'))
        if (dir) mkdirSync(dir, { recursive: true })
        writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subs, null, 2), 'utf-8')
      } catch { /* ignore */ }
    }

    if (action === 'subscribe' && repo && pr) {
      const subs = loadSubscriptions()
      const existing = subs.find(s => s.repo === repo && s.pr === pr)
      const state = this.fetchPRState(repo, pr)
      if (!existing) {
        subs.push({ repo, pr, lastState: state?.state, lastTitle: state?.title })
      } else {
        existing.lastState = state?.state
        existing.lastTitle = state?.title
      }
      saveSubscriptions(subs)
      const lines = ['## Subscribed', '', `- #${pr} in ${repo}`, '', `Subscriptions: ${subs.length}`]
      if (state) lines.push('', `**Current State:** ${state.state} - ${state.title}`)
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    }

    if (action === 'unsubscribe' && repo && pr) {
      const subs = loadSubscriptions()
      const filtered = subs.filter(s => !(s.repo === repo && s.pr === pr))
      saveSubscriptions(filtered)
      return { content: [{ type: 'text', text: `Unsubscribed from #${pr} in ${repo}. Remaining: ${filtered.length}` }] }
    }

    if (action === 'poll') {
      const subs = loadSubscriptions()
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
      saveSubscriptions(subs)
      if (changes.length > 0) {
        lines.push('', '### Changes Detected', '')
        changes.forEach(c => lines.push(`- ${c}`))
      } else {
        lines.push('', 'No state changes detected.')
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    }

    if (action === 'list' && !repo) {
      const subs = loadSubscriptions()
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
    return { content: [{ type: 'text', text: 'Usage: subscribe_pr with action=check repo=owner/repo pr=123' }] }
  }
}
