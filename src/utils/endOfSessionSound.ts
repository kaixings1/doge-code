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

// 同步 require 内置模块：避免 async import 推迟到微任务，否则在退出流程中
// gracefulShutdown 同步退出进程后，ffplay 永远没机会被 spawn（原 bug：wav
// 模式整段不响，beep 模式因同步写 \x07 反而能响）。
function reqChildProcess(): typeof import('node:child_process') {
  return require('node:child_process')
}
function reqFs(): typeof import('node:fs') {
  return require('node:fs')
}

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
      // 同步播放：必须阻塞到播完，因为调用方紧接着就 gracefulShutdown
      // 退出进程，异步 spawn 会在播放器启动前被杀死（原 wav 模式不响的根因）。
      playFileSync(mode, path)
    }
  } catch (e) {
    logForDebugging(`[sessionEndSound] 播放失败: ${e}`, { level: 'debug' })
  }
}

function playFileSync(mode: 'mp3' | 'wav', filePath: string): void {
  const { existsSync } = reqFs()
  if (!existsSync(filePath)) {
    logForDebugging(`[sessionEndSound] 文件不存在: ${filePath}`, { level: 'debug' })
    return
  }
  const { spawnSync, execFileSync } = reqChildProcess()
  if (process.platform === 'win32') {
    // Windows：优先 PowerShell SoundPlayer（走独立音频管线，Windows Terminal
    // 下也能真出声，本仓库 soundNotification.ts 已验证）。mp3 需 ffplay 解码。
    if (mode === 'wav') {
      try {
        execFileSync('powershell', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `(New-Object System.Media.SoundPlayer '${filePath.replace(/'/g, "''")}').PlaySync()`,
        ], { timeout: 5000, windowsHide: true })
        return
      } catch (e) {
        logForDebugging(`[sessionEndSound] SoundPlayer 失败: ${e}`, { level: 'debug' })
      }
    }
    // mp3 或 wav 回退：ffplay 同步播放（阻塞到播完）
    try {
      spawnSync('ffplay', ['-autoexit', '-nodisp', '-quiet', filePath], {
        timeout: 10000,
        windowsHide: true,
      })
      return
    } catch (e) {
      logForDebugging(`[sessionEndSound] ffplay 失败: ${e}`, { level: 'debug' })
    }
    return
  }
  // macOS / Linux
  const candidates: string[][] =
    mode === 'mp3'
      ? [['ffplay', '-autoexit', '-nodisp', '-quiet', filePath]]
      : [['afplay', filePath], ['ffplay', '-autoexit', '-nodisp', '-quiet', filePath]]
  for (const cmd of candidates) {
    try {
      spawnSync(cmd[0], cmd.slice(1), { timeout: 10000 })
      return
    } catch {
      // 尝试下一个
    }
  }
  logForDebugging(
    `[sessionEndSound] 未找到可用的音频播放器 (ffplay/afplay)`,
    { level: 'debug' },
  )
}
