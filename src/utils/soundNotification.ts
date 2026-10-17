/**
 * 任务完成声音提醒模块
 * 当 AI 任务完成并等待用户输入时，播放提示音
 *
 * 支持 Windows 和 macOS/Linux 终端
 */

// 是否启用声音提醒（默认启用以支持多窗口场景）
const SOUND_NOTIFICATION_ENABLED = process.env.SOUND_ON_TASK_COMPLETE !== 'false'

// 是否启用自动继续模式（任务完成时自动注入继续消息）
const AUTO_CONTINUE_ENABLED = process.env.AUTO_CONTINUE_ON_COMPLETE === 'true'
/** 检查是否启用了自动继续模式 */
export function isAutoContinueEnabled(): boolean {
  return AUTO_CONTINUE_ENABLED
}
let _beepSupported: boolean | null = null

// 去重：同一类声音在窗口期内只播一次。
//
// 存在两条独立的完成音触发路径——query.ts 在 return { reason:'completed' }
// 前播一次，REPL.tsx 在 sessionStatus 由 busy→idle 时再播一次。查询正常结束
// 时两者必然先后触发，造成双响。在模块层去重比删掉任一处更安全：
// query.ts 那一路在自动继续模式（AUTO_CONTINUE_ON_COMPLETE=true）下有独立
// 价值——那时循环 continue，状态不转 idle，REPL 那一路根本不会触发。
const DEDUPE_WINDOW_MS = 2500
const lastPlayedAt = new Map<string, number>()

function shouldPlay(kind: string): boolean {
  const now = Date.now()
  const last = lastPlayedAt.get(kind)
  if (typeof last === 'number' && now - last < DEDUPE_WINDOW_MS) {
    return false
  }
  lastPlayedAt.set(kind, now)
  return true
}

/**
 * 检测终端是否支持 beep
 */
function isBeepSupported(): boolean {
  if (_beepSupported !== null) return _beepSupported
  try {
    // Windows: 使用 PowerShell 的 Console.Beep
    if (process.platform === 'win32') {
      _beepSupported = true
    } else {
      // Unix: 尝试输出 bell 字符
      process.stdout.write('\x07')
      _beepSupported = true
    }
  } catch {
    _beepSupported = false
  }
  return _beepSupported
}

/**
 * Windows 上通过 PowerShell 播放 beep 声音
 */
function playWindowsBeep(_frequency: number, _duration: number): void {
  // 优先用 Windows 音频子系统播放系统音效。它走独立音频管线、不依赖 conhost
  // 控制台，因此在 Windows Terminal 下也能真正发声（Console.Beep 在 WT 中静默写
  // 成功、不出声，正是“原来响、换终端后不响”的根因）。Console.Beep / bell 字符
  // 作为降级路径保留给极端环境。
  try {
    const { execFileSync } = require('child_process')
    execFileSync('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "(New-Object System.Media.SoundPlayer 'C:\\Windows\\Media\\ding.wav').PlaySync()",
    ], { timeout: 3000, windowsHide: true })
    return
  } catch {
    // 降级 1：经典 beep API（在 conhost 下有效）
    try {
      const { execFileSync } = require('child_process')
      execFileSync('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '[System.Console]::Beep(800, 150)',
      ], { timeout: 1000, windowsHide: true })
      return
    } catch {
      // 降级 2：终端 bell 字符
      try { process.stdout.write('\x07') } catch {}
    }
  }
}

/**
 * Unix 上通过终端 bell 播放声音
 */
function playUnixBell(): void {
  try {
    process.stdout.write('\x07')
  } catch {}
}

/**
 * 播放通知声音
 */
export function playNotificationSound(
  frequency: number = 800,
  duration: number = 200,
): void {
  if (!SOUND_NOTIFICATION_ENABLED) return
  if (!isBeepSupported()) return

  if (process.platform === 'win32') {
    playWindowsBeep(frequency, duration)
  } else {
    playUnixBell()
  }
}

/**
 * 播放任务完成的提示音
 * 短促的两声提示，表示对话结束
 */
export function playTaskCompleteSound(): void {
  if (!SOUND_NOTIFICATION_ENABLED) return
  if (!isBeepSupported()) return
  if (!shouldPlay('complete')) return

  if (process.platform === 'win32') {
    // Windows: 两次短促 Beep
    playWindowsBeep(800, 150)
    setTimeout(() => playWindowsBeep(1000, 150), 200)
  } else {
    // Unix: 两次 bell
    playUnixBell()
    setTimeout(() => playUnixBell(), 200)
  }
}

/**
 * 播放需要用户干预的提示音
 * 三声急促提示，表示需要用户处理
 */
export function playInterventionSound(): void {
  if (!SOUND_NOTIFICATION_ENABLED) return
  if (!isBeepSupported()) return
  if (!shouldPlay('intervention')) return

  if (process.platform === 'win32') {
    // Windows: 三声急促 Beep
    playWindowsBeep(600, 100)
    setTimeout(() => playWindowsBeep(600, 100), 150)
    setTimeout(() => playWindowsBeep(800, 150), 300)
  } else {
    // Unix: 三次 bell
    playUnixBell()
    setTimeout(() => playUnixBell(), 150)
    setTimeout(() => playUnixBell(), 300)
  }
}

/**
 * 播放错误提示音
 * 低沉的长音
 */
export function playErrorSound(): void {
  if (!SOUND_NOTIFICATION_ENABLED) return
  if (!isBeepSupported()) return
  if (!shouldPlay('error')) return

  if (process.platform === 'win32') {
    playWindowsBeep(300, 500)
  } else {
    playUnixBell()
    setTimeout(() => playUnixBell(), 400)
  }
}

/**
 * 播放自定义序列音
 */
export function playSequence(_notes: Array<{ freq: number; duration: number; delay?: number }>): void {
  if (!SOUND_NOTIFICATION_ENABLED) return
  // 暂不实现复杂序列
}
