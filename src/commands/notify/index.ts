import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

interface NotificationRule {
  id: string
  event: 'task-complete' | 'build-fail' | 'test-fail' | 'commit-push' | 'error' | 'custom'
  enabled: boolean
  message: string
  sound: boolean
  desktop: boolean
}

const CONFIG_FILE = join(homedir(), '.doge', 'notifications.json')

function loadRules(): NotificationRule[] {
  try {
    if (existsSync(CONFIG_FILE)) return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
  } catch { /* ignore */ }
  return []
}

function saveRules(rules: NotificationRule[]) {
  try {
    const dir = join(homedir(), '.doge')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(CONFIG_FILE, JSON.stringify(rules, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'list'
  const rules = loadRules()

  if (cmd === 'list' || cmd === '' || cmd === 'status') {
    if (rules.length === 0) return { type: 'text', value: 'No notification rules. Use /notify add <event> to create one.' }
    const lines = ['Notification Rules:', '===================', '']
    rules.forEach(r => {
      lines.push((r.enabled ? '[ON]' : '[OFF]') + ' ' + r.event + ' - ' + r.message.slice(0, 50))
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'add') {
    const event = parts[1] as NotificationRule['event']
    const message = parts.slice(2).join(' ') || 'Event triggered: ' + event
    if (!event) return { type: 'text', value: 'Usage: /notify add <event> [message]\nEvents: task-complete, build-fail, test-fail, commit-push, error, custom' }
    const rule: NotificationRule = {
      id: 'notif-' + Date.now().toString(36),
      event,
      enabled: true,
      message,
      sound: true,
      desktop: true,
    }
    rules.push(rule)
    saveRules(rules)
    return { type: 'text', value: '[OK] Added notification for: ' + event }
  }

  if (cmd === 'test') {
    const event = parts[1] || 'custom'
    const message = 'Test notification: ' + event
    return { type: 'text', value: '[TEST] ' + message + '\n(Sound and desktop notification would trigger here)' }
  }

  if (cmd === 'enable' || cmd === 'disable') {
    const id = parts[1]
    if (!id) return { type: 'text', value: 'Usage: /notify ' + cmd + ' <id>' }
    const rule = rules.find(r => r.id === id || r.id.startsWith(id))
    if (!rule) return { type: 'text', value: 'Not found: ' + id }
    rule.enabled = cmd === 'enable'
    saveRules(rules)
    return { type: 'text', value: '[OK] ' + cmd + 'd: ' + rule.event }
  }

  if (cmd === 'delete' || cmd === 'remove') {
    const id = parts[1]
    if (!id) return { type: 'text', value: 'Usage: /notify delete <id>' }
    const idx = rules.findIndex(r => r.id === id || r.id.startsWith(id))
    if (idx === -1) return { type: 'text', value: 'Not found: ' + id }
    const removed = rules.splice(idx, 1)[0]
    saveRules(rules)
    return { type: 'text', value: '[OK] Deleted: ' + removed.event }
  }

  if (cmd === 'clear') {
    saveRules([])
    return { type: 'text', value: '[OK] All notification rules cleared' }
  }

  return { type: 'text', value: [
    'Notification System',
    '',
    'Usage:',
    '  /notify list               List notification rules',
    '  /notify add <event> [msg]  Add notification rule',
    '  /notify test [event]       Test a notification',
    '  /notify enable/disable <id> Toggle rule',
    '  /notify delete <id>        Delete a rule',
    '  /notify clear              Clear all rules',
    '',
    'Events: task-complete, build-fail, test-fail, commit-push, error, custom',
  ].join('\n') }
}

const notify: Command = {
  type: 'local',
  name: 'notify',
  description: 'Notification system - alerts for events and task completion',
  aliases: ['/notify', '/alert'],
  supportsNonInteractive: true,
  call: call as unknown as Command['call'],
}

export default notify
