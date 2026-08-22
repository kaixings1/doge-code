import type { Command, LocalCommandResult, LocalJSXCommandContext } from '../../types/command.js'
import type { Message } from '../../types/message.js'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const SCRIPT = 'D:/doge-code/scripts/clone-all.py'

function pushProgress(context: LocalJSXCommandContext | undefined, text: string, replaceLast = false) {
  if (!context?.setMessages) return
  context.setMessages((prev: Message[]) => {
    if (replaceLast && prev.length > 0) {
      const last = prev[prev.length - 1]
      if (last.type === 'assistant' && (last as unknown as Record<string, unknown>).isMeta) {
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            uuid: `progress-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            message: { content: [{ type: 'text', text }] },
          },
        ]
      }
    }
    return [
      ...prev,
      {
        type: 'assistant' as const,
        isMeta: true,
        uuid: `progress-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        message: { content: [{ type: 'text', text }] },
      },
    ]
  })
}

const call = async (args: string, context: LocalJSXCommandContext | undefined): Promise<LocalCommandResult> => {
  const raw = (args ?? '').trim()

  // Handle help
  if (raw === 'help' || raw === '--help' || raw === '-h') {
    return {
      type: 'text' as const,
      value: [
        '📦 **/clone-all** — 批量克隆或更新高星 MCP/AI-agent/skill 仓库',
        '',
        '用法：',
        '  /clone-all              克隆所有匹配仓库（无数量限制）',
        '  /clone-all 2500         限制克隆前 2500 个（按 star 排序）',
        '  /clone-all 5000         限制克隆前 5000 个',
        '  /clone-all update       更新所有已克隆的仓库（git pull）',
        '  /clone-all 500 update   更新前 500 个仓库',
        '  /clone-all help         显示此帮助',
        '',
        '功能：',
        '  • 从 GitHub API 搜索高星仓库（MCP / Claude skills / agent 等）',
        '  • 合并 curated 列表 + JSON 列表 + 搜索结果',
        '  • 关键词过滤（mcp, claude, agent, playwright...）',
        '  • 代理优先下载（gh-proxy.org），失败回退到原始地址',
        '  • 跳过已存在的仓库（大小写不敏感去重）',
        '  • 按 star 数排序，优先克隆高星项目',
        '  • update 模式：对已有仓库执行 git pull --ff-only',
        '',
        '输出目录：D:\\doge-code\\.github\\agent',
        '脚本：temp/clone_all_1500.py',
      ].join('\n'),
    }
  }

  if (!existsSync(SCRIPT)) {
    return { type: 'text' as const, value: `❌ 脚本不存在：${SCRIPT}` }
  }

  // Parse args: split by space, recognize "update" / "u" as --update flag
  const parts = raw.split(/\s+/).filter(Boolean)
  const isUpdate = parts.includes('update') || parts.includes('-u')
  const countArg = parts.find(p => /^\d+$/.test(p))

  const cmdArgs: string[] = []
  if (isUpdate) cmdArgs.push('--update')
  if (countArg) cmdArgs.push(countArg)

  // Spawn process for real-time output
  return new Promise<LocalCommandResult>((resolve) => {
    const child = spawn('python', ['-u', SCRIPT, ...cmdArgs], {
      cwd: 'D:/doge-code',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    })

    let stdout = ''
    let stderr = ''
    let startTime = Date.now()
    let lineBuffer = ''

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      stdout += text

      // Push incremental lines to UI for real-time feedback
      lineBuffer += text
      while (true) {
        const idx = lineBuffer.indexOf('\n')
        if (idx === -1) break
        const line = lineBuffer.slice(0, idx).trim()
        lineBuffer = lineBuffer.slice(idx + 1)
        if (line) pushProgress(context, line, false)
      }
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('close', (code) => {
      // Flush remaining line buffer
      const remaining = lineBuffer.trim()
      if (remaining) pushProgress(context, remaining, false)

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      const output = stdout.trim() || '(无输出)'

      if (code === 0) {
        resolve({ type: 'text' as const, value: `✅ 完成（耗时 ${elapsed}s）\n\n${output}` })
      } else {
        const errMsg = stderr.trim() || '(无错误详情)'
        resolve({ type: 'text' as const, value: `❌ 退出码 ${code}（耗时 ${elapsed}s）\n\n输出：\n${output}\n\n错误：\n${errMsg}`.trim() })
      }
    })

    child.on('error', (err) => {
      resolve({ type: 'text' as const, value: `❌ 进程启动失败：${err.message}\n请确认 python3 已安装且在 PATH 中。` })
    })
  })
}

const cloneAll: Command = {
  type: 'local',
  name: 'clone-all',
  description: '批量克隆或更新高星 MCP/AI-agent/skill 仓库（支持数量限制和 update 模式）',
  aliases: ['/clone-all'],
  argumentHint: '[count|update|help]',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default cloneAll
export { cloneAll }
