/**
 * 任务完成声音提醒模块
 * 当 AI 任务完成并等待用户输入时，播放提示音
 *
 * 支持 Windows 和 macOS/Linux 终端
 */

import { isEnvTruthy } from './envUtils.js'

// 是否启用声音提醒（默认启用以支持多窗口场景）
const SOUND_NOTIFICATION_ENABLED = process.env.SOUND_ON_TASK_COMPLETE !== 'false'

let _beepSupported: boolean | null = null

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
function playWindowsBeep(frequency: number, duration: number): void {
  try {
    // 使用简短 PowerShell 命令播放系统 beep
    const { execFileSync } = require('child_process')
    execFileSync('powershell', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `[System.Console]::Beep(${frequency}, ${duration})`,
    ], { timeout: 1000, windowsHide: true })
  } catch {
    // 降级：输出 bell 字符
    try { process.stdout.write('\x07') } catch {}
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
