/**
 * /toolgroup —— 工具组管理命令
 *
 * 与 src/utils/toolGroups.ts 配套：那里是配置与过滤逻辑，这里只是命令入口。
 * 所有写操作都落盘到 ~/.doge/config.json 的 toolGroups 段，切换后下一次
 * 获取工具列表即生效（无需重启）。
 */
import type { LocalCommandCall } from '../../types/command.js'
import { getAllBaseTools } from '../../tools.js'
import {
  GLOBAL_GROUP_NAME,
  addToolToGroup,
  deleteToolGroup,
  getActiveGroupName,
  listToolGroups,
  removeToolFromGroup,
  saveGroupAs,
  setActiveGroup,
} from '../../utils/toolGroups.js'

type TextResult = { type: 'text'; value: string }

const call: LocalCommandCall = async (args: string): Promise<TextResult> => {
  const parts = (args || '').trim().split(/\s+/).filter(Boolean)
  const action = (parts[0] || 'list').toLowerCase()

  try {
    switch (action) {
      case 'list':
      case 'ls':
        return handleList()
      case 'use':
        return handleUse(parts[1])
      case 'new':
        return handleNew(parts[1])
      case 'add':
        return handleAdd(parts[1], parts.slice(2))
      case 'rm':
      case 'remove':
        return handleRemove(parts[1], parts.slice(2))
      case 'del':
      case 'delete':
        return handleDelete(parts[1])
      case 'tools':
        return handleTools(parts[1])
      default:
        return { type: 'text', value: getHelpText() }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { type: 'text', value: `工具组操作失败: ${message}` }
  }
}

function handleList(): TextResult {
  const active = getActiveGroupName()
  const groups = listToolGroups()
  const lines: string[] = ['工具组', '']

  for (const group of groups) {
    const mark = group.name === active ? '●' : '○'
    const count =
      group.name === GLOBAL_GROUP_NAME
        ? `${getAllBaseTools({ unfiltered: true }).length} 个工具`
        : `${group.tools.length} 个工具`
    lines.push(`  ${mark} ${group.name.padEnd(16)} ${count}`)
    if (group.description) {
      lines.push(`    ${group.description}`)
    }
  }

  lines.push('')
  lines.push(`当前激活: ${active}`)
  lines.push('')
  lines.push('  /toolgroup use <组名>          切换到该组（立即生效）')
  lines.push('  /toolgroup new <组名>          按当前全部工具另存为新组')
  lines.push('  /toolgroup add <组名> <工具..>  向组内添加工具')
  lines.push('  /toolgroup rm  <组名> <工具..>  从组内移除工具')
  lines.push('  /toolgroup tools [组名]         查看组内工具 / 全部可选工具')
  lines.push('  /toolgroup del <组名>           删除组')
  return { type: 'text', value: lines.join('\n') }
}

function handleUse(name?: string): TextResult {
  if (!name) return { type: 'text', value: '用法: /toolgroup use <组名>' }
  setActiveGroup(name)
  const count =
    name === GLOBAL_GROUP_NAME
      ? getAllBaseTools({ unfiltered: true }).length
      : getAllBaseTools().length
  return {
    type: 'text',
    value: `已切换到工具组「${name}」，当前可用 ${count} 个工具（下一次请求即生效）。`,
  }
}

function handleNew(name?: string): TextResult {
  if (!name) return { type: 'text', value: '用法: /toolgroup new <组名>' }
  const snapshot = getAllBaseTools({ unfiltered: true }).map(t => t.name)
  const group = saveGroupAs(name, snapshot, '由全部工具另存')
  return {
    type: 'text',
    value: `已创建工具组「${group.name}」，含 ${group.tools.length} 个工具。\n用 /toolgroup rm ${group.name} <工具名> 精简，或 /toolgroup use ${group.name} 启用。`,
  }
}

function handleAdd(groupName?: string, toolNames: string[] = []): TextResult {
  if (!groupName || toolNames.length === 0) {
    return { type: 'text', value: '用法: /toolgroup add <组名> <工具名> [工具名...]' }
  }
  const known = new Set(getAllBaseTools({ unfiltered: true }).map(t => t.name))
  const unknown = toolNames.filter(t => !known.has(t))
  if (unknown.length > 0) {
    return {
      type: 'text',
      value: `以下工具不存在（用 /toolgroup tools 查看全部可选工具）: ${unknown.join(', ')}`,
    }
  }
  let group = addToolToGroup(groupName, toolNames[0]!)
  for (const toolName of toolNames.slice(1)) {
    group = addToolToGroup(groupName, toolName)
  }
  return {
    type: 'text',
    value: `工具组「${group.name}」现有 ${group.tools.length} 个工具: ${group.tools.join(', ')}`,
  }
}

function handleRemove(groupName?: string, toolNames: string[] = []): TextResult {
  if (!groupName || toolNames.length === 0) {
    return { type: 'text', value: '用法: /toolgroup rm <组名> <工具名> [工具名...]' }
  }
  let group = removeToolFromGroup(groupName, toolNames[0]!)
  for (const toolName of toolNames.slice(1)) {
    group = removeToolFromGroup(groupName, toolName)
  }
  return {
    type: 'text',
    value: `工具组「${group.name}」现有 ${group.tools.length} 个工具: ${group.tools.join(', ') || '(空)'}`,
  }
}

function handleDelete(name?: string): TextResult {
  if (!name) return { type: 'text', value: '用法: /toolgroup del <组名>' }
  deleteToolGroup(name)
  return { type: 'text', value: `已删除工具组「${name}」。` }
}

function handleTools(groupName?: string): TextResult {
  const name = groupName || getActiveGroupName()
  const groups = listToolGroups()
  const group = groups.find(g => g.name === name)
  if (!group) {
    return { type: 'text', value: `工具组不存在: ${name}` }
  }
  const allNames = getAllBaseTools({ unfiltered: true }).map(t => t.name).sort()
  const lines: string[] = [`工具组「${name}」`, '']

  if (name === GLOBAL_GROUP_NAME) {
    lines.push(`  全部可用工具（${allNames.length}）:`)
    for (const toolName of allNames) {
      lines.push(`    ${toolName}`)
    }
  } else {
    const allow = new Set(group.tools)
    lines.push(`  组内工具（${group.tools.length}）:`)
    for (const toolName of [...group.tools].sort()) {
      lines.push(`    ${allow.has(toolName) ? '✓' : '×'} ${toolName}`)
    }
    lines.push('')
    lines.push('  未加入的工具（可用 /toolgroup add 添加）:')
    for (const toolName of allNames.filter(n => !allow.has(n))) {
      lines.push(`    ${toolName}`)
    }
  }
  return { type: 'text', value: lines.join('\n') }
}

function getHelpText(): string {
  return [
    '工具组管理',
    '',
    '  /toolgroup list                列出所有组及当前激活组',
    '  /toolgroup use <组名>          切换激活组（立即生效）',
    '  /toolgroup new <组名>          按当前全部工具另存为新组',
    '  /toolgroup add <组名> <工具..>  向组内添加工具',
    '  /toolgroup rm  <组名> <工具..>  从组内移除工具',
    '  /toolgroup tools [组名]         查看组内工具 / 全部可选工具',
    '  /toolgroup del <组名>           删除组',
    '',
    '配置保存在 ~/.doge/config.json 的 toolGroups 段。',
    'global 为内置全局组（全部工具），不可增删。',
  ].join('\n')
}

export default call
