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
      return { type: 'text', value: 'No custom commands. Use /custom-cmd create <name> to create one.' }
    }
    const lines = ['Custom Commands:', '==================', '']
    commands.forEach(c => {
      lines.push('/' + c.name + ' - ' + c.description + ' [' + c.version + ']')
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'create') {
    const name = parts[1]
    if (!name) return { type: 'text', value: 'Usage: /custom-cmd create <name>' }
    const description = parts.slice(2).join(' ') || 'Custom command'
    const newCmd: CustomCommand = {
      name,
      description,
      template: '## Task\n' + description + '\n\nExecute the task described above.',
      aliases: [],
      author: 'user',
      version: '1.0.0',
      tags: ['custom'],
      enabled: true,
    }
    saveCommand(newCmd)
    return { type: 'text', value: '[OK] Created /' + name + '\nEdit: ' + join(CONFIG_DIR, name + '.json') }
  }

  if (cmd === 'delete') {
    const name = parts[1]
    if (!name) return { type: 'text', value: 'Usage: /custom-cmd delete <name>' }
    try {
      const fs = require('fs')
      fs.unlinkSync(join(CONFIG_DIR, name + '.json'))
      return { type: 'text', value: '[OK] Deleted /' + name }
    } catch {
      return { type: 'text', value: '[ERROR] Not found: ' + name }
    }
  }

  if (cmd === 'show') {
    const name = parts[1]
    if (!name) return { type: 'text', value: 'Usage: /custom-cmd show <name>' }
    const commands = loadCommands()
    const found = commands.find(c => c.name === name)
    if (!found) return { type: 'text', value: 'Not found: ' + name }
    return { type: 'text', value: JSON.stringify(found, null, 2) }
  }

  if (cmd === 'enable' || cmd === 'disable') {
    const name = parts[1]
    if (!name) return { type: 'text', value: 'Usage: /custom-cmd ' + cmd + ' <name>' }
    const commands = loadCommands()
    const found = commands.find(c => c.name === name)
    if (!found) return { type: 'text', value: 'Not found: ' + name }
    found.enabled = cmd === 'enable'
    saveCommand(found)
    return { type: 'text', value: '[OK] ' + cmd + 'd /' + name }
  }

  if (cmd === 'help') {
    return { type: 'text', value: [
      'Custom Commands',
      '',
      '📖 Usage: ',
      '  /custom-cmd list               List all custom commands',
      '  /custom-cmd create <name>      Create a new custom command',
      '  /custom-cmd delete <name>      Delete a custom command',
      '  /custom-cmd show <name>        Show command details',
      '  /custom-cmd enable <name>      Enable a command',
      '  /custom-cmd disable <name>     Disable a command',
      '  /custom-cmd help               Show this help',
    ].join('\n') }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const customCmd: Command = {
  type: 'local',
  name: 'custom-cmd',
  description: 'Manage custom slash commands',
  aliases: ['/custom-cmd', '/cc'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default customCmd
