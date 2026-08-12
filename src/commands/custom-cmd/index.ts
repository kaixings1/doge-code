import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.doge', 'custom-commands')

interface CustomCommand {
  name: string
  description: string
  template: string
  aliases: string[]
  author: string
  version: string
  tags: string[]
  enabled: boolean
}

function loadCommands(): CustomCommand[] {
  const commands: CustomCommand[] = []
  try {
    if (!existsSync(CONFIG_DIR)) return commands
    const files = readdirSync(CONFIG_DIR)
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          commands.push(JSON.parse(readFileSync(join(CONFIG_DIR, file), 'utf-8')))
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
  return commands
}

function saveCommand(cmd: CustomCommand) {
  try {
    if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
    writeFileSync(join(CONFIG_DIR, cmd.name + '.json'), JSON.stringify(cmd, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'list'

  if (cmd === 'list' || cmd === 'ls' || cmd === '') {
    const commands = loadCommands()
    if (commands.length === 0) {
      return { type: 'text', value: 'ℹ️ 暂无自定义命令。使用 /custom-cmd create <名称> 创建一个。' }
    }
    const lines = ['📋 自定义命令列表：', '═══════════════════', '']
    commands.forEach(c => {
      lines.push('/' + c.name + ' - ' + c.description + ' [' + c.version + ']')
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'create') {
    const name = parts[1]
    if (!name) return { type: 'text', value: '📖 用法：/custom-cmd create <名称>' }
    const description = parts.slice(2).join(' ') || '自定义命令'
    const newCmd: CustomCommand = {
      name,
      description,
      template: '## 任务\n' + description + '\n\n执行上述描述的任务。',
      aliases: [],
      author: 'user',
      version: '1.0.0',
      tags: ['custom'],
      enabled: true,
    }
    saveCommand(newCmd)
    return { type: 'text', value: '✅ 已创建：/' + name + '\n编辑：' + join(CONFIG_DIR, name + '.json') }
  }

  if (cmd === 'delete') {
    const name = parts[1]
    if (!name) return { type: 'text', value: '📖 用法：/custom-cmd delete <名称>' }
    try {
      const fs = require('fs')
      fs.unlinkSync(join(CONFIG_DIR, name + '.json'))
      return { type: 'text', value: '✅ 已删除：/' + name }
    } catch {
      return { type: 'text', value: '❌ 未找到：' + name }
    }
  }

  if (cmd === 'show') {
    const name = parts[1]
    if (!name) return { type: 'text', value: '📖 用法：/custom-cmd show <名称>' }
    const commands = loadCommands()
    const found = commands.find(c => c.name === name)
    if (!found) return { type: 'text', value: '❌ 未找到：' + name }
    return { type: 'text', value: JSON.stringify(found, null, 2) }
  }

  if (cmd === 'enable' || cmd === 'disable') {
    const name = parts[1]
    if (!name) return { type: 'text', value: '📖 用法：/custom-cmd ' + cmd + ' <名称>' }
    const commands = loadCommands()
    const found = commands.find(c => c.name === name)
    if (!found) return { type: 'text', value: '❌ 未找到：' + name }
    found.enabled = cmd === 'enable'
    saveCommand(found)
    return { type: 'text', value: '✅ 已' + (cmd === 'enable' ? '启用' : '禁用') + '：/' + name }
  }

  if (cmd === 'help') {
    return { type: 'text', value: [
      '📋 自定义命令', '',
      '📖 用法：',
      '  /custom-cmd list               列出所有自定义命令',
      '  /custom-cmd create <名称>      创建自定义命令',
      '  /custom-cmd delete <名称>      删除自定义命令',
      '  /custom-cmd show <名称>        查看命令详情',
      '  /custom-cmd enable <名称>      启用命令',
      '  /custom-cmd disable <名称>     禁用命令',
      '  /custom-cmd help               显示此帮助',
    ].join('\n') }
  }

  return { type: 'text', value: '❌ 未知命令：' + cmd }
}

const customCmd: Command = {
  type: 'local',
  name: 'custom-cmd',
  description: '管理自定义斜杠命令',
  aliases: ['/custom-cmd', '/cc'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default customCmd
