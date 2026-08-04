import { type Tool } from '../../engine/types.js'
import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const SUBSCRIPTIONS_FILE = join(homedir(), '.doge', 'pr-subscriptions.json')

export class SubscribePRTool implements Tool {
  name = 'subscribe_pr'
  description = 'Subscribe to GitHub PR status changes and check PR details'
  parameters = {
    type: 'object' as const,
    properties: {
      action: { type: 'string', description: 'Action: check, list, or subscribe', enum: ['check', 'list', 'subscribe'] },
      repo: { type: 'string', description: 'Repository in format owner/repo' },
      pr: { type: 'number', description: 'PR number' }
    },
    required: ['action']
  }
  validate = () => ({ valid: true })
  execute = async (params: Record<string, any>) => {
    const action = params?.action || 'list'
    const repo = params?.repo || ''
    const pr = params?.pr || 0

    // 持久化订阅管理
    const loadSubscriptions = (): Array<{ repo: string; pr: number }> => {
      try {
        if (!existsSync(SUBSCRIPTIONS_FILE)) return []
        return JSON.parse(readFileSync(SUBSCRIPTIONS_FILE, 'utf-8'))
      } catch { return [] }
    }
    const saveSubscriptions = (subs: Array<{ repo: string; pr: number }>) => {
      try {
        const dir = SUBSCRIPTIONS_FILE.substring(0, SUBSCRIPTIONS_FILE.lastIndexOf('\\'))
        if (dir) mkdirSync(dir, { recursive: true })
        writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(subs, null, 2), 'utf-8')
      } catch { /* ignore */ }
    }

    if (action === 'subscribe' && repo && pr) {
      const subs = loadSubscriptions()
      if (!subs.some(s => s.repo === repo && s.pr === pr)) {
        subs.push({ repo, pr })
        saveSubscriptions(subs)
      }
      const lines = ['## Subscribed', '', `- #${pr} in ${repo}`, '', `Subscriptions: ${subs.length}`]
      // 立即检查状态
      try {
        const output = execSync(`gh pr view ${pr} --repo ${repo} --json state,title 2>&1`, { encoding: 'utf-8', timeout: 15000 })
        const data = JSON.parse(output)
        lines.push('', `**Current State:** ${data.state} - ${data.title}`)
      } catch { /* ignore */ }
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
