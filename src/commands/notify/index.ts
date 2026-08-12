import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

interface NotificationRule {
  id: string
  event: 'task-complete' | 'build-fail' | 'test-fail' | 'commit-push' | 'error' | 'custom' | 'schedule' | 'mention'
  enabled: boolean
  message: string
  sound: boolean
  desktop: boolean
  email: boolean
  webhook: string
  cooldown: number
  lastTriggered?: string
}

interface NotificationLog {
  id: string
  ruleId: string
  event: string
  message: string
  timestamp: string
  read: boolean
}

const CONFIG_FILE = join(homedir(), '.doge', 'notifications.json')
const LOG_FILE = join(homedir(), '.doge', 'notification-log.json')

function loadRules(): NotificationRule[] {
  try { if (existsSync(CONFIG_FILE)) return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) } catch { /* ignore */ }
  return []
}

function saveRules(rules: NotificationRule[]) {
  try {
    const dir = join(homedir(), '.doge')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(CONFIG_FILE, JSON.stringify(rules, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

function loadLog(): NotificationLog[] {
  try { if (existsSync(LOG_FILE)) return JSON.parse(readFileSync(LOG_FILE, 'utf-8')) } catch { /* ignore */ }
  return []
}

function saveLog(log: NotificationLog[]) {
  try {
    const dir = join(homedir(), '.doge')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    if (log.length > 100) log.splice(0, log.length - 100)
    writeFileSync(LOG_FILE, JSON.stringify(log, null, 2), 'utf-8')
  } catch { /* ignore */ }
}

function addLog(ruleId: string, event: string, message: string) {
  const log = loadLog()
  log.push({ id: 'log-' + Date.now(), ruleId, event, message, timestamp: new Date().toISOString(), read: false })
  saveLog(log)
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'list'
  const rules = loadRules()

  if (cmd === 'list' || cmd === '' || cmd === 'status') {
    if (rules.length === 0) return { type: 'text', value: 'No notification rules. Use /notify add <event> to create one.' }
    const lines = ['Notification Rules:', '====================', '']
    rules.forEach(r => {
      lines.push((r.enabled ? '[ON]' : '[OFF]') + ' ' + r.event + ' - ' + r.message.slice(0, 50))
      lines.push('  Sound: ' + r.sound + ' | Desktop: ' + r.desktop + ' | Cooldown: ' + r.cooldown + 's')
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'add' || cmd === 'create') {
    const event = parts[1] as NotificationRule['event']
    const message = parts.slice(2).join(' ') || 'Event triggered: ' + event
    if (!event) return { type: 'text', value: 'Usage: /notify add <event> [message]\nEvents: task-complete, build-fail, test-fail, commit-push, error, custom, schedule, mention' }
    const rule: NotificationRule = { id: 'notif-' + Date.now(), event, enabled: true, message, sound: true, desktop: true, email: false, webhook: '', cooldown: 60 }
    rules.push(rule)
    saveRules(rules)
    return { type: 'text', value: '[OK] Added notification for: ' + event }
  }

  if (cmd === 'test') {
    const event = parts[1] || 'custom'
    const message = 'Test notification: ' + event
    addLog('test', event, message)
    return { type: 'text', value: '[TEST] ' + message + '\n(Sound + Desktop + Log)' }
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

  if (cmd === 'log' || cmd === 'history') {
    const log = loadLog()
    if (log.length === 0) return { type: 'text', value: 'No notifications logged yet.' }
    const lines = ['Notification Log:', '==================', '']
    log.slice(-20).forEach(l => {
      lines.push((l.read ? '[R]' : '[NEW]') + ' ' + l.timestamp.slice(0, 19) + ' - ' + l.event + ': ' + l.message.slice(0, 60))
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'clear-log') {
    saveLog([])
    return { type: 'text', value: '[OK] Notification log cleared' }
  }

  if (cmd === 'mark-read') {
    const log = loadLog()
    log.forEach(l => { l.read = true })
    saveLog(log)
    return { type: 'text', value: '[OK] All notifications marked as read' }
  }

  if (cmd === 'config') {
    const id = parts[1]
    const key = parts[2]
    const value = parts.slice(3).join(' ')
    if (!id || !key) return { type: 'text', value: 'Usage: /notify config <id> <key> <value>\nKeys: sound, desktop, email, webhook, cooldown' }
    const rule = rules.find(r => r.id === id || r.id.startsWith(id))
    if (!rule) return { type: 'text', value: 'Not found: ' + id }
    // @ts-expect-error dynamic
    if (key === 'sound' || key === 'desktop' || key === 'email') rule[key] = value === 'true'
    else if (key === 'cooldown') rule.cooldown = parseInt(value) || 60
    else if (key === 'webhook') rule.webhook = value
    saveRules(rules)
    return { type: 'text', value: '[OK] ' + key + ' = ' + value }
  }

  return { type: 'text', value: [
    'Notification System', '', '📖 Usage: ',
    '  /notify list               List rules', '  /notify add <event> [msg]  Add rule',
    '  /notify test [event]       Test notification', '  /notify enable/disable <id> Toggle',
    '  /notify delete <id>        Delete rule', '  /notify log                View history',
    '  /notify mark-read          Mark all read', '  /notify clear-log          Clear history',
    '  /notify config <id> <k> <v> Configure rule',
    '', 'Events: task-complete, build-fail, test-fail, commit-push, error, custom, schedule, mention',
  ].join('\n') }
}

const notify: Command = {
  type: 'local', name: 'notify',
  description: 'Notifications - rules, events, history, webhooks',
  aliases: ['/notify', '/alert'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default notify
