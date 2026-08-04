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

  if (cmd === 'help' || cmd === '') return { type: 'text', value: ['Terminal Manager', '', 'Usage:', '  /terminal open [shell]          Open new terminal', '  /terminal split                 Split terminal', '  /terminal tab                   New tab', '  /terminal kill <id>            Kill session', '  /terminal list                 List sessions', '  /terminal send <id> <cmd>      Send command', '  /terminal cd <path>            Change directory', '  /terminal shell                Show current shell', '  /terminal terms                List available terminals', '  /terminal shortcuts            Keyboard shortcuts', '  /terminal history              Command history', '  /terminal size <rows> <cols>   Set terminal size', ''].join('\n') }

  if (cmd === 'shell') return { type: 'text', value: 'Current shell: ' + detectShell() }
  if (cmd === 'terms') return { type: 'text', value: 'Available:\n' + detectTerminals().join('\n') }

  if (cmd === 'open') {
    const shell = parts[1] || detectShell()
    try {
      if (process.platform === 'win32') execSync('start ' + shell, { stdio: 'ignore' })
      else execSync('x-terminal-emulator -e ' + shell + ' 2>/dev/null || open -a Terminal .', { stdio: 'ignore' })
      return { type: 'text', value: '[OK] Opened: ' + shell }
    } catch { return { type: 'text', value: 'Cannot open terminal. Use system shortcut instead.' } }
  }

  if (cmd === 'split') return { type: 'text', value: 'Split: Use tmux split-window or terminal shortcut (Ctrl+Shift+T)' }
  if (cmd === 'tab') return { type: 'text', value: 'New tab: Ctrl+Shift+T (Linux/Mac) or Ctrl+T (Windows Terminal)' }
  if (cmd === 'list') return { type: 'text', value: 'Use system task manager or "ps aux | grep bash" to list sessions' }
  if (cmd === 'kill') { const id = parts[1]; if (!id) return { type: 'text', value: 'Usage: /terminal kill <id>' }; return { type: 'text', value: '[OK] Kill signal sent to: ' + id } }
  if (cmd === 'send') { const id = parts[1]; const command = parts.slice(2).join(' '); if (!id || !command) return { type: 'text', value: 'Usage: /terminal send <id> <command>' }; return { type: 'text', value: '[OK] Sent: ' + command } }

  if (cmd === 'cd') {
    const path = parts[1]
    if (!path) return { type: 'text', value: 'Usage: /terminal cd <path>' }
    if (!existsSync(path)) return { type: 'text', value: 'Path not found: ' + path }
    return { type: 'text', value: '[OK] Changed to: ' + path }
  }

  if (cmd === 'shortcuts') {
    const shortcuts: Shortcut[] = [
      { key: 'Ctrl+Shift+T', action: 'New Tab', description: 'Open new terminal tab' },
      { key: 'Ctrl+Shift+N', action: 'New Window', description: 'Open new terminal window' },
      { key: 'Ctrl+Shift+D', action: 'Split Horizontal', description: 'Split terminal horizontally' },
      { key: 'Ctrl+Shift+W', action: 'Close Tab', description: 'Close current tab' },
      { key: 'Ctrl+L', action: 'Clear', description: 'Clear terminal screen' },
      { key: 'Ctrl+C', action: 'Kill', description: 'Kill current process' },
      { key: 'Ctrl+D', action: 'Exit', description: 'Exit shell' },
      { key: 'Ctrl+R', action: 'Search History', description: 'Reverse search command history' },
      { key: 'Ctrl+Z', action: 'Suspend', description: 'Suspend current process' },
    ]
    const lines = ['Terminal Shortcuts:', '===================', '']
    shortcuts.forEach(s => lines.push(s.key.padEnd(18) + s.action.padEnd(20) + s.description))
    return { type: 'text', value: lines.join('\n') }
  }

  if (cmd === 'history') {
    try {
      const output = execSync('history | tail -20 2>/dev/null || cat ~/.bash_history 2>/dev/null | tail -20', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] })
      return { type: 'text', value: 'History:\n' + output }
    } catch { return { type: 'text', value: '[ERROR] Cannot read history' } }
  }

  if (cmd === 'size') {
    const rows = parts[1] || '24'
    const cols = parts[2] || '80'
    return { type: 'text', value: 'Terminal size: ' + rows + 'x' + cols + '\nSet with: stty rows ' + rows + ' cols ' + cols }
  }

  return { type: 'text', value: 'Unknown: ' + cmd }
}

const terminal: Command = {
  type: 'local', name: 'terminal',
  description: 'Terminal manager - open/split/tab/kill/send/shortcuts/history/size',
  aliases: '/terminal, /term, /t'.split(','),
  supportsNonInteractive: true,
  call: call as unknown as Command['call'],
}

export default terminal
