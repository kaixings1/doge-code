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
  if ((args || '').trim() === 'help' || (args || '').trim() === '--help' || (args || '').trim() === '-h') {
    return { output: `notify — 🔔 通知 - 规则/事件/历史/Webhook\n用法: /notify`.trim(), truncated: false }
  }
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'list'
  const rules = loadRules()

  if (cmd === 'list' || cmd === '' || cmd === 'status') {
    if (rules.length === 0) return { type: 'text', value: '📋 无通知规则。使用 /notify add <事件> 创建规则。' }
    const lines = ['🔔 通知规则：', '====================', '']
    rules.forEach(r => {
      lines.push((r.enabled ? '✅ 开启' : '⛔ 关闭') + ' ' + r.event + ' - ' + r.message.slice(0, 50))
      lines.push('  声音：' + r.sound + ' | 桌面：' + r.desktop + ' | 冷却：' + r.cooldown + '秒')
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'add' || cmd === 'create') {
    const event = parts[1] as NotificationRule['event']
    const message = parts.slice(2).join(' ') || '事件触发：' + event
    if (!event) return { type: 'text', value: '📖 用法：/notify add <事件> [消息]\n事件：task-complete（任务完成）、build-fail（构建失败）、test-fail（测试失败）、commit-push（提交推送）、error（错误）、custom（自定义）、schedule（定时）、mention（提及）' }
    const rule: NotificationRule = { id: 'notif-' + Date.now(), event, enabled: true, message, sound: true, desktop: true, email: false, webhook: '', cooldown: 60 }
    rules.push(rule)
    saveRules(rules)
    return { type: 'text', value: '✅ 已添加通知规则：' + event }
  }

  if (cmd === 'test') {
    const event = parts[1] || 'custom'
    const message = 'Test notification: ' + event
    addLog('test', event, message)
    return { type: 'text', value: '🧪 [测试] ' + message + '\n（声音 + 桌面通知 + 日志）' }
  }

  if (cmd === 'enable' || cmd === 'disable') {
    const id = parts[1]
    if (!id) return { type: 'text', value: '📖 用法：/notify ' + cmd + ' <ID>' }
    const rule = rules.find(r => r.id === id || r.id.startsWith(id))
    if (!rule) return { type: 'text', value: '❌ 未找到：' + id }
    rule.enabled = cmd === 'enable'
    saveRules(rules)
    return { type: 'text', value: '✅ ' + (cmd === 'enable' ? '已启用' : '已禁用') + '：' + rule.event }
  }

  if (cmd === 'delete' || cmd === 'remove') {
    const id = parts[1]
    if (!id) return { type: 'text', value: '📖 用法：/notify delete <ID>' }
    const idx = rules.findIndex(r => r.id === id || r.id.startsWith(id))
    if (idx === -1) return { type: 'text', value: '❌ 未找到：' + id }
    const removed = rules.splice(idx, 1)[0]
    saveRules(rules)
    return { type: 'text', value: '✅ 已删除：' + removed.event }
  }

  if (cmd === 'log' || cmd === 'history') {
    const log = loadLog()
    if (log.length === 0) return { type: 'text', value: '📋 暂无通知记录。' }
    const lines = ['📅 通知日志：', '==================', '']
    log.slice(-20).forEach(l => {
      lines.push((l.read ? '[已读]' : '[新]') + ' ' + l.timestamp.slice(0, 19) + ' - ' + l.event + '：' + l.message.slice(0, 60))
    })
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'clear-log') {
    saveLog([])
    return { type: 'text', value: '✅ 通知日志已清空' }
  }

  if (cmd === 'mark-read') {
    const log = loadLog()
    log.forEach(l => { l.read = true })
    saveLog(log)
    return { type: 'text', value: '✅ 所有通知已标记为已读' }
  }

  if (cmd === 'config') {
    const id = parts[1]
    const key = parts[2]
    const value = parts.slice(3).join(' ')
    if (!id || !key) return { type: 'text', value: '📖 用法：/notify config <ID> <键> <值>\n键：sound（声音）、desktop（桌面）、email（邮件）、webhook、cooldown（冷却秒数）' }
    const rule = rules.find(r => r.id === id || r.id.startsWith(id))
    if (!rule) return { type: 'text', value: 'Not found: ' + id }
    // @ts-expect-error dynamic
    if (key === 'sound' || key === 'desktop' || key === 'email') rule[key] = value === 'true'
    else if (key === 'cooldown') rule.cooldown = parseInt(value) || 60
    else if (key === 'webhook') rule.webhook = value
    saveRules(rules)
    return { type: 'text', value: '✅ ' + key + ' = ' + value }
  }

  return { type: 'text', value: [
    '🔔 通知系统', '', '📖 用法：',
    '  /notify list               列出规则', '  /notify add <事件> [消息]  添加规则',
    '  /notify test [事件]         测试通知', '  /notify enable/disable <ID> 切换开关',
    '  /notify delete <ID>        删除规则', '  /notify log               查看历史',
    '  /notify mark-read          全部标记为已读', '  /notify clear-log          清空历史',
    '  /notify config <ID> <键> <值> 配置规则',
    '', '事件：task-complete（任务完成）、build-fail（构建失败）、test-fail（测试失败）、commit-push（提交推送）、error（错误）、custom（自定义）、schedule（定时）、mention（提及）',
  ].join('\n') }
}

const notify: Command = {
  type: 'local', name: 'notify',
  description: '🔔 通知 - 规则/事件/历史/Webhook',
  aliases: ['/notify', '/alert'], supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default notify
