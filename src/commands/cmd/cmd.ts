import type { LocalCommandCall, LocalCommandResult } from '../../types/command.js'

const call: LocalCommandCall = async (args, context) => {
  const query = args.trim().toLowerCase()
  const allCommands = context.availableCommands || []

  let filtered = allCommands
  if (query) {
    filtered = allCommands.filter((cmd: any) =>
      cmd.name?.toLowerCase().includes(query) ||
      cmd.description?.toLowerCase().includes(query) ||
      cmd.aliases?.some((a: string) => a.toLowerCase().includes(query)) ||
      cmd.argumentHint?.toLowerCase().includes(query) ||
      cmd.whenToUse?.toLowerCase().includes(query),
    )
  }

  if (filtered.length === 0) {
    return {
      output: query
        ? `没有找到匹配 "${args}" 的命令\n\n提示: 尝试搜索命令名、别名或关键词`
        : '没有可用的命令',
      truncated: false,
    }
  }

  // Group commands by type
  const groups: Record<string, any[]> = {
    prompt: [],
    local: [],
    'local-jsx': [],
    other: [],
  }

  for (const cmd of filtered) {
    const type = cmd.type || 'other'
    if (groups[type]) {
      groups[type].push(cmd)
    } else {
      groups.other.push(cmd)
    }
  }

  const typeLabels: Record<string, string> = {
    prompt: '💬 AI 技能',
    local: '⚡ 本地命令',
    'local-jsx': '🖥️ 交互命令',
    other: '📦 其他',
  }

  const lines: string[] = []
  let globalIndex = 0

  for (const [type, typeLabel] of Object.entries(typeLabels)) {
    const cmds = groups[type]
    if (!cmds || cmds.length === 0) continue

    lines.push(`── ${typeLabel} (${cmds.length}) ──`)

    for (const cmd of cmds) {
      globalIndex++
      const name = cmd.name || ''
      const desc = cmd.description || ''
      const aliases = cmd.aliases?.length ? ` (别名: ${cmd.aliases.join(', ')})` : ''
      const hint = cmd.argumentHint ? ` ${cmd.argumentHint}` : ''
      const typeTag = cmd.type === 'prompt' ? '[AI]' : cmd.type === 'local' ? '[本地]' : cmd.type === 'local-jsx' ? '[交互]' : ''

      lines.push(`  ${globalIndex}. /${name}${hint}${aliases} - ${desc} ${typeTag}`.trim())
    }

    lines.push('')
  }

  // Add keyboard navigation hints
  const totalResults = filtered.length
  const hints: string[] = []
  hints.push(`共 ${totalResults} 个命令`)
  if (query) {
    hints.push('继续输入可进一步过滤')
  }
  hints.push('Tab 键自动补全 | ↑↓ 浏览历史 | Ctrl+R 搜索历史')

  lines.push('── 导航提示 ──')
  for (const hint of hints) {
    lines.push(`  ${hint}`)
  }

  return { type: 'text' as const, value: lines.join('\n') }
}

export default call
