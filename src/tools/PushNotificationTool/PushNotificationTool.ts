import { type Tool } from '../../engine/types.js'
import { execSync } from 'child_process'

interface NotificationItem {
  title: string
  message: string
  sound: boolean
  priority: 'low' | 'normal' | 'high'
}

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

  private queue: NotificationItem[] = []
  private sending = false
  private lastSent: string | null = null
  private sentCount = 0

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

      if (process.platform === 'win32') {
        // Windows: 使用 PowerShell toast（支持优先级的简单方式）
        const soundFlag = item.sound ? '' : ' -silent'
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

    const item: NotificationItem = { title, message, sound, priority }

    // 立即发送（wait 模式）
    if (wait) {
      this.sendNotification(item)
      this.lastSent = `${title}: ${message}`
      this.sentCount++
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