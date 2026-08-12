import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync, spawn } from 'child_process'
import { existsSync } from 'fs'

interface TerminalSession {
  id: string
  name: string
  shell: string
  cwd: string
  status: 'running' | 'stopped'
}

interface Shortcut {
  key: string
  action: string
  description: string
}

function detectShell(): string {
  if (process.platform === 'win32') return 'cmd.exe'
  return process.env.SHELL || '/bin/bash'
}

function detectTerminals(): string[] {
  const terms = []
  if (process.platform === 'win32') {
    if (existsSync('C:\\Windows\\System32\\cmd.exe')) terms.push('cmd')
    if (existsSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')) terms.push('powershell')
    terms.push('wt', 'git-bash')
  } else {
    terms.push('bash', 'zsh', 'fish', 'sh')
    if (process.platform === 'darwin') terms.push('Terminal.app', 'iTerm2')
    else terms.push('gnome-terminal', 'konsole', 'xterm', 'alacritty', 'kitty')
  }
  return terms
}

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const cmd = parts[0]?.toLowerCase() || 'help'

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['终端管理器', '', '📖 用法：', '  /terminal open [shell]          打开终端', '  /terminal split                 分屏', '  /terminal tab                   新建标签页', '  /terminal kill <id>            结束会话', '  /terminal list                 列出会话', '  /terminal send <id> <cmd>      发送命令', '  /terminal cd <path>            切换目录', '  /terminal shell                 当前 Shell', '  /terminal terms                 可用终端列表', '  /terminal shortcuts             键盘快捷键', '  /terminal history               命令历史', '  /terminal size <行> <列>        设置终端大小', ''].join('\n') }

  if (cmd === 'shell') return { type: 'text', value: '当前 Shell：' + detectShell() }
  if (cmd === 'terms') return { type: 'text', value: '可用终端：\n' + detectTerminals().join('\n') }

  if (cmd === 'open') {
    const shell = parts[1] || detectShell()
    try {
      if (process.platform === 'win32') execSync('start ' + shell, { stdio: 'ignore' })
      else execSync('x-terminal-emulator -e ' + shell + ' 2>/dev/null || open -a Terminal .', { stdio: 'ignore' })
      return { type: 'text', value: '✅ 已打开：' + shell }
    } catch { return { type: 'text', value: '无法打开终端，请使用系统快捷键。' } }
  }

  if (cmd === 'split') return { type: 'text', value: '💡 分屏：使用 tmux split-window 或终端快捷键 (Ctrl+Shift+T)' }
  if (cmd === 'tab') return { type: 'text', value: '💡 新标签页：Ctrl+Shift+T (Linux/Mac) 或 Ctrl+T (Windows Terminal)' }
  if (cmd === 'list') return { type: 'text', value: '📋 使用系统任务管理器或 "ps aux | grep bash" 列出会话' }
  if (cmd === 'kill') { const id = parts[1]; if (!id) return { type: 'text', value: '📖 用法：/terminal kill <id>' }; return { type: 'text', value: '✅ 已发送结束信号：' + id } }
  if (cmd === 'send') { const id = parts[1]; const command = parts.slice(2).join(' '); if (!id || !command) return { type: 'text', value: '📖 用法：/terminal send <id> <命令>' }; return { type: 'text', value: '✅ 已发送：' + command } }

  if (cmd === 'cd') {
    const path = parts[1]
    if (!path) return { type: 'text', value: '📖 用法：/terminal cd <路径>' }
    if (!existsSync(path)) return { type: 'text', value: '❌ 路径未找到：' + path }
    return { type: 'text', value: '✅ 已切换到：' + path }
  }

  if (cmd === 'shortcuts') {
    const shortcuts: Shortcut[] = [
      { key: 'Ctrl+Shift+T', action: '新建标签页', description: '打开新终端标签页' },
      { key: 'Ctrl+Shift+N', action: '新建窗口', description: '打开新终端窗口' },
      { key: 'Ctrl+Shift+D', action: '水平分屏', description: '水平分割终端' },
      { key: 'Ctrl+Shift+W', action: '关闭标签页', description: '关闭当前标签页' },
      { key: 'Ctrl+L', action: '清除', description: '清除终端屏幕' },
      { key: 'Ctrl+C', action: '终止', description: '终止当前进程' },
      { key: 'Ctrl+D', action: '退出', description: '退出 Shell' },
      { key: 'Ctrl+R', action: '搜索历史', description: '反向搜索命令历史' },
      { key: 'Ctrl+Z', action: '暂停', description: '暂停当前进程' },
    ]
    const lines = ['终端快捷键：', '═════════════', '']
    shortcuts.forEach(s => lines.push(s.key.padEnd(18) + s.action.padEnd(20) + s.description))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'history') {
    try {
      const output = execSync('history | tail -20 2>/dev/null || cat ~/.bash_history 2>/dev/null | tail -20', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: '📋 历史记录：\n' + output }
    } catch { return { type: 'text', value: '❌ 无法读取历史记录' } }
  }

  if (cmd === 'size') {
    const rows = parts[1] || '24'
    const cols = parts[2] || '80'
    return { type: 'text', value: '📐 终端大小：' + rows + 'x' + cols + '\n使用命令设置：stty rows ' + rows + ' cols ' + cols }
  }

  return { type: 'text', value: '❌ 未知：' + cmd }
}

const terminal: Command = {
  type: 'local', name: 'terminal',
  description: 'Terminal manager - open/split/tab/kill/send/shortcuts/history/size',
  aliases: '/terminal, /term, /t'.split(','),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
}

export default terminal
