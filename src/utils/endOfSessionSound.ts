/**
 * 会话结束提示音。
 *
 * 通过环境变量 CLAUDE_CODE_SESSION_END_SOUND 控制：
 *   - 未设置 / 空：使用终端蜂鸣（\x07），兼容性最好
 *   - beep：终端蜂鸣
 *   - mp3:<path>：播放指定 MP3 文件
 *   - wav:<path>：播放指定 WAV 文件
 *   - none：关闭
 *
 * 仅在用户主动退出会话时触发（/exit、Ctrl+C 两次、Ctrl+D 等）。
 * 由 ExitFlow 在调用 gracefulShutdown 之前触发。
 */

import { isEnvTruthy } from './envUtils.js'
import { logForDebugging } from './debug.js'

type SoundMode = 'beep' | 'mp3' | 'wav' | 'none'

function getSoundConfig(): { mode: SoundMode; path?: string } {
  const raw = (process.env.CLAUDE_CODE_SESSION_END_SOUND ?? '').trim()
  if (!raw || raw === 'beep') {
    return { mode: 'beep' }
  }
  if (raw === 'none') {
    return { mode: 'none' }
  }
  if (raw.startsWith('mp3:')) {
    return { mode: 'mp3', path: raw.slice(4) }
  }
  if (raw.startsWith('wav:')) {
    return { mode: 'wav', path: raw.slice(4) }
  }
  // 未知值回退到 beep
  return { mode: 'beep' }
}

let triggered = false

export function isSessionEndSoundEnabled(): boolean {
  return !isEnvTruthy(process.env.CLAUDE_CODE_SESSION_END_SOUND)
    ? process.env.CLAUDE_CODE_SESSION_END_SOUND !== undefined
    : true
}

export function triggerSessionEndSound(): void {
  if (triggered) return
  triggered = true

  const { mode, path } = getSoundConfig()
  if (mode === 'none') return

  try {
    if (mode === 'beep') {
      // 终端蜂鸣，同步写入确保退出前发出
      process.stdout.write('\x07')
      return
    }
    if ((mode === 'mp3' || mode === 'wav') && path) {
      // 异步播放，不阻塞退出流程
      playFileAsync(mode, path).catch(() => {})
    }
  } catch (e) {
    logForDebugging(`[sessionEndSound] 播放失败: ${e}`, { level: 'debug' })
  }
}

async function playFileAsync(mode: 'mp3' | 'wav', filePath: string): Promise<void> {
  const { spawn } = await import('node:child_process')
  const { existsSync } = await import('node:fs')
  if (!existsSync(filePath)) {
    logForDebugging(`[sessionEndSound] 文件不存在: ${filePath}`, { level: 'debug' })
    return
  }
  // 优先使用系统播放器，回退到 ffplay / afplay / start
  const candidates: string[][] = [
    ['ffplay', '-autoexit', '-nodisp', '-quiet', filePath],
    ['afplay', filePath],
    ['start', '/min', filePath],
  ]
  for (const cmd of candidates) {
    try {
      const child = spawn(cmd[0], cmd.slice(1), {
        detached: true,
        stdio: 'ignore',
      })
      child.unref()
      return
    } catch {
      // 尝试下一个
    }
  }
  logForDebugging(
    `[sessionEndSound] 未找到可用的音频播放器 (ffplay/afplay/start)`,
    { level: 'debug' },
  )
}