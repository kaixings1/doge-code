import type { LocalCommandResult } from '../../commands.js'
import type { ToolUseContext } from '../../Tool.js'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const CHECKPOINTS_FILE = join(homedir(), '.doge', 'checkpoints.json')

interface CheckpointEntry {
  name: string
  stashRef: string
  createdAt: string
  message: string
}

function ensureDogeDir(): void {
  const dir = join(homedir(), '.doge')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function loadCheckpoints(): CheckpointEntry[] {
  try {
    if (existsSync(CHECKPOINTS_FILE)) {
      return JSON.parse(readFileSync(CHECKPOINTS_FILE, 'utf-8'))
    }
  } catch { /* ignore */ }
  return []
}

function saveCheckpoints(checkpoints: CheckpointEntry[]): void {
  ensureDogeDir()
  writeFileSync(CHECKPOINTS_FILE, JSON.stringify(checkpoints, null, 2), 'utf-8')
}

function getStashList(): Array<{ index: number; message: string }> {
  try {
    const output = execSync('git stash list', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
    return output.split('\n').filter(Boolean).map((line, i) => {
      const match = line.match(/^stash@\{\d+\}: (.+)$/)
      return { index: i, message: match?.[1] || line }
    })
  } catch {
    return []
  }
}

function parseArgs(args: string): { subcommand: string; name: string } {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  return {
    subcommand: parts[0] || 'list',
    name: parts.slice(1).join(' ') || '',
  }
}

function handleCreate(name: string): LocalCommandResult {
  if (!name) {
    return {
      type: 'text',
      value: '用法: /rewind checkpoint create <name>\n\n示例:\n  /rewind checkpoint create before-refactor\n  /rewind checkpoint create pre-migration',
    }
  }

  try {
    const stashMessage = `checkpoint:${name}`
    execSync(`git stash push -m "${stashMessage}"`, { stdio: 'ignore' })

    const stashes = getStashList()
    const latestStash = stashes[0]
    const stashRef = latestStash ? `stash@{${latestStash.index}}` : 'unknown'

    const checkpoints = loadCheckpoints()
    checkpoints.push({
      name,
      stashRef,
      createdAt: new Date().toISOString(),
      message: latestStash?.message || stashMessage,
    })
    saveCheckpoints(checkpoints)

    return {
      type: 'text',
      value: `✅ 已创建检查点: ${name}\n   Git 暂存: ${stashRef}\n   时间: ${new Date().toLocaleString('zh-CN')}`,
    }
  } catch (err) {
    return {
      type: 'text',
      value: `❌ 创建检查点失败: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

function handleList(): LocalCommandResult {
  const checkpoints = loadCheckpoints()

  if (checkpoints.length === 0) {
    return {
      type: 'text',
      value: '📋 没有保存的检查点\n\n使用 /rewind checkpoint create <name> 创建检查点',
    }
  }

  const lines = ['📋 已保存的检查点:', '=================', '']

  for (let i = checkpoints.length - 1; i >= 0; i--) {
    const cp = checkpoints[i]!
    const date = new Date(cp.createdAt).toLocaleString('zh-CN')
    lines.push(`  ${i + 1}. ${cp.name}`)
    lines.push(`     时间: ${date}`)
    lines.push(`     暂存: ${cp.stashRef}`)
    lines.push('')
  }

  lines.push(`共 ${checkpoints.length} 个检查点`)
  lines.push('使用 /rewind checkpoint restore <name> 恢复检查点')

  return { type: 'text', value: lines.join('\n') }
}

function handleRestore(name: string): LocalCommandResult {
  if (!name) {
    return {
      type: 'text',
      value: '用法: /rewind checkpoint restore <name>\n\n示例:\n  /rewind checkpoint restore before-refactor',
    }
  }

  const checkpoints = loadCheckpoints()
  const idx = checkpoints.findIndex(cp => cp.name === name)

  if (idx === -1) {
    return {
      type: 'text',
      value: `❌ 未找到检查点: ${name}\n使用 /rewind checkpoint list 查看所有检查点`,
    }
  }

  const checkpoint = checkpoints[idx]!
  try {
    execSync(`git stash pop ${checkpoint.stashRef}`, { stdio: 'ignore' })
    checkpoints.splice(idx, 1)
    saveCheckpoints(checkpoints)

    return {
      type: 'text',
      value: `✅ 已恢复检查点: ${name}\n   暂存已弹出并应用`,
    }
  } catch (err) {
    return {
      type: 'text',
      value: `❌ 恢复检查点失败: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

function handleHelp(): LocalCommandResult {
  return {
    type: 'text',
    value: [
      '📸 检查点管理（基于 Git Stash）',
      '',
      '📖 用法:',
      '  /rewind checkpoint create <name>   创建检查点（git stash）',
      '  /rewind checkpoint list            列出所有检查点',
      '  /rewind checkpoint restore <name>  恢复检查点（git stash pop）',
      '',
      '示例:',
      '  /rewind checkpoint create before-refactor',
      '  /rewind checkpoint list',
      '  /rewind checkpoint restore before-refactor',
      '',
      `存储位置: ${CHECKPOINTS_FILE}`,
    ].join('\n'),
  }
}

export const call = async (
  args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const { subcommand, name } = parseArgs(args)

  switch (subcommand) {
    case 'create':
      return handleCreate(name)
    case 'list':
    case 'ls':
      return handleList()
    case 'restore':
    case 'load':
      return handleRestore(name)
    case 'help':
    case '--help':
    case '-h':
      return handleHelp()
    default:
      return handleHelp()
  }
}
