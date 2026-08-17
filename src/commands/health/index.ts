/**
 * src/commands/health/index.ts
 *
 * 项目健康总览命令 — 整合代码健康度、健康评分、服务器状态
 *
 * 用法：
 *   /health                  # 总览（代码健康 + 评分 + 服务器）
 *   /health code             # 代码健康检查（复用 code-health）
 *   /health score            # 健康评分（复用 health-score）
 *   /health server           # 本地服务器状态检查
 */

import type { Command } from '../../commands.js'
import type { LocalCommandCall, LocalCommandResult } from '../../types/command.js'
import { existsSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'
import { homedir } from 'os'

// ─── 子命令注册表 ────────────────────────────────────────────────

type SubCommand = (args: string) => Promise<LocalCommandResult>

interface SubCmdDef {
  name: string
  description: string
  fn: SubCommand
}

const subCommands: Record<string, SubCmdDef> = {}

function register(name: string, description: string, fn: SubCommand) {
  subCommands[name] = { name, description, fn }
}

// ─── 工具函数 ──────────────────────────────────────────────────

function text(value: string): LocalCommandResult {
  return { type: 'text', value }
}

// ─── 子命令: code ───────────────────────────────────────────────

register('code', '代码健康检查（复杂度/大小/文档/安全/重复）', async (args) => {
  const mod = await import('../code-health/index.js')
  const cmd = mod.default as { load: () => Promise<{ call: (a: string, c?: any) => Promise<{ type: string; value: string }> }> }
  const result = await cmd.load().then(m => m.call(''))
  return { type: 'text', value: result.value } as LocalCommandResult
})

// ─── 子命令: score ─────────────────────────────────────────────

register('score', '健康评分（安全/复杂度/可维护性/错误处理/依赖）', async (args) => {
  const mod = await import('../health-score/index.js')
  const cmd = mod as { call: (a: string, c?: any) => Promise<{ type: string; value: string }> }
  const result = await cmd.call('')
  return { type: 'text', value: result.value } as LocalCommandResult
})

// ─── 子命令: server ────────────────────────────────────────────

register('server', '本地服务器状态检查', async (args) => {
  const serverPort = process.env.DOGE_SERVER_PORT || '3710'
  const serverHost = process.env.DOGE_SERVER_HOST || '127.0.0.1'
  const healthUrl = `http://${serverHost}:${serverPort}/health`

  const lines = ['## 🖥️ 服务器状态', '']

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(healthUrl, { signal: controller.signal })
    clearTimeout(timeout)

    if (res.ok) {
      const data = await res.json().catch(() => ({}))
      lines.push(`**状态**: ✅ 运行中`)
      lines.push(`**端口**: ${serverPort}`)
      lines.push(`**版本**: ${(data as any).version || 'unknown'}`)
      lines.push('')
      lines.push('服务器响应正常，服务可用。')
    } else {
      lines.push(`**状态**: ⚠️ 异常 (HTTP ${res.status})`)
      lines.push(`服务器返回非 200 状态码，请检查服务日志。`)
    }
  } catch (err: any) {
    lines.push(`**状态**: ❌ 无法连接`)
    lines.push(`**错误**: ${err.message || '连接超时或服务未启动'}`)
    lines.push('')
    lines.push('请确认服务已启动：')
    lines.push('```')
    lines.push(`bun run src/server/server.ts`)
    lines.push('```')
  }

  return text(lines.join('\n'))
})

// ─── 主命令 ─────────────────────────────────────────────────────

const call: LocalCommandCall = async (args, _context): Promise<LocalCommandResult> => {
  const trimmed = args.trim()
  const parts = trimmed.split(/\s+/)
  const sub = parts[0] || 'overview'

  // 帮助
  if (sub === 'help' || sub === '--help' || sub === '-h') {
    const entries = Object.values(subCommands)
    return text(
      '## 🏥 项目健康检查 (/health)\n' +
      '\n' +
      '用法：\n' +
      '```\n' +
      '  /health                # 总览（全部检查）\n' +
      '  /health code           # 代码健康度\n' +
      '  /health score          # 健康评分\n' +
      '  /health server         # 服务器状态\n' +
      '```\n' +
      '\n' +
      '子命令：\n' +
      entries.map(e => `- **${e.name}**: ${e.description}`).join('\n') +
      '\n',
    )
  }

  // 子命令分发
  if (subCommands[sub]) {
    return subCommands[sub].fn(parts.slice(1).join(' '))
  }

  // 默认：总览
  return runOverview()
}

async function runOverview(): Promise<LocalCommandResult> {
  const lines = ['## 🏥 项目健康总览', '']

  // 1. 代码健康度
  try {
    const codeResult = await subCommands['code'].fn('')
    const codeText = codeResult.value
    const scoreMatch = codeText.match(/\*\*总分\*\*:\s*(\d+)/)
    const gradeMatch = codeText.match(/\*\*等级\*\*:\s*(\S+)/)
    const score = scoreMatch ? scoreMatch[1] : '?'
    const grade = gradeMatch ? gradeMatch[1] : '?'
    lines.push(`### 📁 代码健康度`)
    lines.push(`**分数**: ${score}/100 (${grade})`)
    lines.push('')
  } catch {
    lines.push('### 📁 代码健康度')
    lines.push('⚠️ 检查失败，请手动运行 `/health code`')
    lines.push('')
  }

  // 2. 健康评分
  try {
    const scoreResult = await subCommands['score'].fn('')
    const scoreText = scoreResult.value
    const match = scoreText.match(/\*\*总分\*\*:\s*(\d+)\/100\s*\((\S+)\)/)
    if (match) {
      lines.push('### 📊 健康评分')
      lines.push(`**分数**: ${match[1]}/100 (${match[2]})`)
      lines.push('')
    }
  } catch {
    lines.push('### 📊 健康评分')
    lines.push('⚠️ 检查失败，请手动运行 `/health score`')
    lines.push('')
  }

  // 3. 服务器状态
  try {
    const serverResult = await subCommands['server'].fn('')
    lines.push(serverResult.value)
    lines.push('')
  } catch {
    lines.push('### 🖥️ 服务器状态')
    lines.push('⚠️ 检查失败，请手动运行 `/health server`')
    lines.push('')
  }

  lines.push('---')
  lines.push('💡 运行 `/health help` 查看所有子命令')

  return text(lines.join('\n'))
}

const health = {
  type: 'local',
  name: 'health',
  description: '项目健康总览 — 代码健康度、健康评分、服务器状态',
  aliases: ['/health'],
  argumentHint: '[code|score|server]',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default health
