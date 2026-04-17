/**
 * 任务完成声音提醒模块
 * 当 AI 任务完成并等待用户输入时，播放提示音
 * 
 * 注意：在 Node.js/Bun CLI 环境中，Web Audio API 不可用
 * 此模块提供优雅降级，不影响主流程
 */

import { isEnvTruthy } from './envUtils.js'

// 是否启用声音提醒（默认禁用，因为 CLI 环境不支持 Web Audio API）
const SOUND_NOTIFICATION_ENABLED = isEnvTruthy(process.env.SOUND_ON_TASK_COMPLETE) || false

/**
 * 播放通知声音
 * 在 CLI 环境中是空操作
 */
export function playNotificationSound(
  frequency: number = 800,
  duration: number = 200,
  type: string = 'sine',
): void {
  if (!SOUND_NOTIFICATION_ENABLED) {
    return
  }

  // CLI 环境中无法播放声音，静默跳过
  // 如果将来需要实现，可以使用：
  // - node-beep 包
  // - 播放 WAV/MP3 文件
  // - 系统 beep 命令
  console.debug('[Sound] Sound notification skipped (not available in CLI mode)')
}

/**
 * 播放任务完成的提示音
 * 在 CLI 环境中是空操作
 */
export function playTaskCompleteSound(): void {
  // CLI 环境中静默跳过
}

/**
 * 播放错误提示音
 * 在 CLI 环境中是空操作
 */
export function playErrorSound(): void {
  // CLI 环境中静默跳过
}

/**
 * 播放自定义序列音
 * 在 CLI 环境中是空操作
 */
export function playSequence(_notes: Array<{ freq: number; duration: number; delay?: number }>): void {
  // CLI 环境中静默跳过
}
