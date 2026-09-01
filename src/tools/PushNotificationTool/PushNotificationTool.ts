import { type Tool } from '../../engine/types.js'
import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

interface NotificationItem {
  title: string
  message: string
  sound: boolean
  priority: 'low' | 'normal' | 'high'
}

interface NotificationRecord {
  title: string
  message: string
  priority: string
  timestamp: string
}

const HISTORY_FILE = join(homedir(), '.doge', 'notifications.json')

export class PushNotificationTool implements Tool {
  name = 'push_notification'
  description = 'Send desktop push notifications with priority queue support'
  parameters = {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'Notification title' },
      message: { type: 'string', description: 'Notification message' },
      sound: { type: 'boolean', description: 'Play sound with notification' },
      priority: { type: 'string', description: 'Priority: low, normal, or high', enum: ['low', 'normal', 'high'] },
      wait: { type: 'boolean', description: 'Wait for delivery confirmation' }
    },
    required: ['title', 'message']
  }
  validate = () => ({ valid: true })
  isEnabled = () => true
  async prompt() {
    return this.description
  }
  userFacingName() {
    return this.name
  }

  private queue: NotificationItem[] = []
  private sending = false
  private lastSent: string | null = null
  private sentCount = 0

  private recordHistory(item: NotificationItem): void {
    try {
      let history: NotificationRecord[] = []
      if (existsSync(HISTORY_FILE)) {
        history = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'))
      }
      history.push({ title: item.title, message: item.message, priority: item.priority, timestamp: new Date().toISOString() })
      if (history.length > 100) history = history.slice(-100)
      const dir = HISTORY_FILE.substring(0, HISTORY_FILE.lastIndexOf('\\'))
      if (dir) mkdirSync(dir, { recursive: true })
      writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8')
    } catch { /* ignore */ }
  }

  /** 获取通知历史 */
  getHistory(limit = 10): NotificationRecord[] {
    try {
      if (!existsSync(HISTORY_FILE)) return []
      const history = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'))
      return Array.isArray(history) ? history.slice(-limit).reverse() : []
    } catch { return [] }
  }

  /** 清空通知历史 */
  clearHistory(): boolean {
    try {
      if (existsSync(HISTORY_FILE)) writeFileSync(HISTORY_FILE, '[]', 'utf-8')
      return true
    } catch { return false }
  }

  private async processQueue(): Promise<void> {
    if (this.sending || this.queue.length === 0) return
    this.sending = true
    try {
      while (this.queue.length > 0) {
        // 高优先级优先
        const highIdx = this.queue.findIndex(n => n.priority === 'high')
        const item = this.queue.splice(highIdx >= 0 ? highIdx : 0, 1)[0]
        this.sendNotification(item)
        this.lastSent = `${item.title}: ${item.message}`
        this.sentCount++
        this.recordHistory(item)
        // 低优先级通知之间稍等，避免刷屏
        if (item.priority === 'low') {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }
    } finally {
      this.sending = false
    }
  }

  private sendNotification(item: NotificationItem): void {
    try {
      const title = item.title.replace(/[\\"']/g, '')
      const message = item.message.replace(/[\\"']/g, '')
      const soundFlag = item.sound ? '' : ' -silent'

      if (process.platform === 'win32') {
        // Windows: 使用 PowerShell toast（支持优先级的简单方式）
        const psScript = `
          [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
          $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
          $textNodes = $template.GetElementsByTagName("text")
          $textNodes.Item(0).AppendChild($template.CreateTextNode('${title}')) > $null
          $textNodes.Item(1).AppendChild($template.CreateTextNode('${message}')) > $null
          $toast = [Windows.UI.Notifications.ToastNotification]::new($template)
          [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Doge Code").Show($toast)
        `
        execSync(`powershell -Command "${psScript.replace(/\n/g, ' ')}"`, { timeout: 5000 })
      } else if (process.platform === 'darwin') {
        execSync(`osascript -e 'display notification "${message}" with title "${title}"'`, { timeout: 5000 })
      } else {
        execSync(`notify-send "${title}" "${message}"${soundFlag}`, { timeout: 5000 })
      }
      if (item.sound && process.platform === 'win32') {
        execSync('powershell -c (New-Object.Media.SoundPlayer "C:\\Windows\\Media\\notify.wav").PlaySync()', { timeout: 3000 })
      }
    } catch { /* 通知失败不阻断 */ }
  }

  execute = async (params: Record<string, any>) => {
    const title = params?.title || 'Notification'
    const message = params?.message || ''
    const sound = params?.sound !== false
    const priority = params?.priority || 'normal'
    const wait = params?.wait === true
    const action = params?.action || 'send'

    // 历史管理操作
    if (action === 'history') {
      const limit = params?.limit || 10
      const history = this.getHistory(limit)
      if (history.length === 0) return { content: [{ type: 'text', text: 'No notification history.' }] }
      const lines = ['## Notification History', '']
      history.forEach(h => lines.push(`- [${h.priority}] ${h.title}: ${h.message} (${h.timestamp})`))
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    }
    if (action === 'clear-history') {
      const ok = this.clearHistory()
      return { content: [{ type: 'text', text: ok ? 'Notification history cleared.' : 'Failed to clear history.' }] }
    }
    if (action === 'stats') {
      const stats = this.getStats()
      return { content: [{ type: 'text', text: `Notifications sent: ${stats.sentCount}\nQueue: ${stats.queueLength}\nLast: ${stats.lastSent || 'none'}` }] }
    }

    const item: NotificationItem = { title, message, sound, priority }

    // 立即发送（wait 模式）
    if (wait) {
      this.sendNotification(item)
      this.lastSent = `${title}: ${message}`
      this.sentCount++
      this.recordHistory(item)
      return {
        content: [{ type: 'text', text: `Notification sent: ${title} - ${message}` }]
      }
    }

    // 入队发送
    this.queue.push(item)
    this.processQueue()
    return {
      content: [{
        type: 'text',
        text: `Notification queued: ${title} - ${message} (priority: ${priority}, queue: ${this.queue.length})`
      }]
    }
  }

  /** 获取通知队列统计 */
  getStats(): { queueLength: number; sentCount: number; lastSent: string | null } {
    return { queueLength: this.queue.length, sentCount: this.sentCount, lastSent: this.lastSent }
  }
}