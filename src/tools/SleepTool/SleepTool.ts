import { feature } from 'bun:bundle'
import { z } from 'zod/v4'
import type { ToolResultBlockParam } from 'src/Tool.js'
import { buildTool } from 'src/Tool.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { notifyAutomationStateChanged } from 'src/utils/sessionState.js'
import {
  SLEEP_TOOL_NAME,
  DESCRIPTION,
  SLEEP_TOOL_PROMPT,
} from './prompt.js'

// 防止外部常量意外为 null/undefined
const SAFE_NAME = SLEEP_TOOL_NAME ?? 'sleep'
const SAFE_DESCRIPTION =
  DESCRIPTION ?? 'Pause execution for a specified number of seconds.'
const SAFE_PROMPT =
  SLEEP_TOOL_PROMPT ??
  'You can use the sleep tool to wait before taking further actions.'

const SLEEP_WAKE_CHECK_INTERVAL_MS = 500

// 内部懒加载工厂，外部注入兜底
const inputSchemaFactory = lazySchema(() =>
  z.strictObject({
    duration_seconds: z
      .number()
      .describe(
        'How long to sleep in seconds. Can be interrupted by the user at any time.',
      ),
  }),
)

// 安全获取 schema，避免 buildTool 收到 null 而访问 .name
function getSafeInputSchema() {
  try {
    const schema = inputSchemaFactory()
    if (schema) return schema
  } catch {
    // 如果 lazySchema 抛错，回退到默认 schema
  }
  // 最终回退：一个安全的基础 schema
  return z.strictObject({
    duration_seconds: z
      .number()
      .describe('Sleep duration in seconds.'),
  })
}

type SleepInput = { duration_seconds: number }
type SleepOutput = { slept_seconds: number; interrupted: boolean }

// ====== 动态 require 安全封装 ======
function safeProactiveMod() {
  try {
    return require('src/proactive/index.js') as typeof import('src/proactive/index.js')
  } catch {
    return null
  }
}

function safeMessageQueueMod() {
  try {
    return require('src/utils/messageQueueManager.js') as typeof import('src/utils/messageQueueManager.js')
  } catch {
    return null
  }
}

function isProactiveAutomationEnabled(): boolean {
  if (!(feature('PROACTIVE') || feature('KAIROS'))) {
    return false
  }
  const mod = safeProactiveMod()
  return mod?.isProactiveActive?.() ?? false
}

function isProactiveSleepAllowed(): boolean {
  if (!(feature('PROACTIVE') || feature('KAIROS'))) {
    return true
  }
  const mod = safeProactiveMod()
  return mod?.isProactiveActive?.() ?? true
}

function hasQueuedWakeSignal(): boolean {
  const queue = safeMessageQueueMod()
  return queue?.hasCommandsInQueue?.() ?? false
}

function shouldInterruptSleep(): boolean {
  return !isProactiveSleepAllowed() || hasQueuedWakeSignal()
}

export const SleepTool = buildTool({
  name: SAFE_NAME,
  searchHint: 'wait pause sleep rest idle duration timer',
  maxResultSizeChars: 1_000,
  strict: true,

  // 关键修复：总是返回有效 schema
  get inputSchema() {
    return getSafeInputSchema()
  },

  async description() {
    return SAFE_DESCRIPTION
  },
  async prompt() {
    return SAFE_PROMPT
  },

  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  interruptBehavior() {
    return 'cancel'
  },
  userFacingName() {
    return SAFE_NAME
  },

  renderToolUseMessage(input: Partial<SleepInput>) {
    const secs = input.duration_seconds ?? '?'
    return `Sleep: ${secs}s`
  },

  mapToolResultToToolResultBlockParam(
    content: SleepOutput,
    toolUseID: string,
  ): ToolResultBlockParam {
    const msg = content.interrupted
      ? `Sleep interrupted after ${content.slept_seconds}s`
      : `Slept for ${content.slept_seconds}s`
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: msg,
    }
  },

  async call(input: SleepInput, context) {
    if (shouldInterruptSleep()) {
      return {
        data: { slept_seconds: 0, interrupted: true },
      }
    }

    const { duration_seconds } = input
    const startTime = Date.now()
    const sleepUntil = startTime + duration_seconds * 1000

    if (isProactiveAutomationEnabled()) {
      notifyAutomationStateChanged({
        enabled: true,
        phase: 'sleeping',
        next_tick_at: null,
        sleep_until: sleepUntil,
      })
    }

    try {
      await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | null = null
        let wakeCheck: ReturnType<typeof setInterval> | null = null
        let settled = false

        const cleanup = () => {
          if (timer !== null) {
            clearTimeout(timer)
            timer = null
          }
          if (wakeCheck !== null) {
            clearInterval(wakeCheck)
            wakeCheck = null
          }
          context.abortController.signal.removeEventListener('abort', onAbort)
        }

        const finish = () => {
          if (settled) return
          settled = true
          cleanup()
          resolve()
        }

        const interrupt = () => {
          if (settled) return
          settled = true
          cleanup()
          reject(new Error('interrupted'))
        }

        const onAbort = () => interrupt()

        timer = setTimeout(finish, duration_seconds * 1000)

        if (context.abortController.signal.aborted) {
          interrupt()
          return
        }
        context.abortController.signal.addEventListener('abort', onAbort, {
          once: true,
        })

        wakeCheck = setInterval(() => {
          if (shouldInterruptSleep()) {
            interrupt()
          }
        }, SLEEP_WAKE_CHECK_INTERVAL_MS)
      })
      return {
        data: { slept_seconds: duration_seconds, interrupted: false },
      }
    } catch {
      const elapsed = Math.round((Date.now() - startTime) / 1000)
      return {
        data: { slept_seconds: elapsed, interrupted: true },
      }
    } finally {
      notifyAutomationStateChanged(
        isProactiveAutomationEnabled()
          ? {
              enabled: true,
              phase: null,
              next_tick_at: null,
              sleep_until: null,
            }
          : null,
      )
    }
  },
})