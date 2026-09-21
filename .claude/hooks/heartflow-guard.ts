#!/usr/bin/env node
/**
 * heartflow-guard.ts — HeartFlow 判别器 Hook
 *
 * 通过 HeartFlow (vendor/heartflow/src/gate.js) 对用户输入 / AI 输出做判别。
 *
 * Hook 契约（Claude Code 官方）：
 *   - stdin 接收 JSON：{ "event": "UserPromptSubmit"|"Stop", "prompt"?: string, "last_assistant_message"?: string }
 *   - stdout 输出任意文本（供 Claude 阅读）
 *   - exit 0  → 放行
 *   - exit 1  → 拦截，stderr 内容作为阻断原因
 *
 * 使用：
 *   node .claude/hooks/heartflow-guard.ts < 输入.json
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

// gate.js 是 CommonJS，hook 运行在 ESM 上下文，用 createRequire 加载
const require = createRequire(import.meta.url)

const HF_GATE = 'D:/doge-code/vendor/heartflow/src/gate.js'

let gate: { checkOutput?: (t: string) => unknown; checkInput?: (t: string) => unknown }

function loadGate() {
  if (gate) return gate
  try {
    gate = require(HF_GATE)
    return gate
  } catch (e) {
    console.error(`[heartflow] 无法加载 HeartFlow (${HF_GATE}): ${(e as Error).message}`)
    process.exit(0) // 降级：加载失败不阻断，只告警
  }
}

function check(input: string, mode: 'input' | 'output'): { blocked: boolean; reason: string } {
  const g = loadGate()
  const fn = mode === 'input' ? g.checkInput : g.checkOutput
  if (!fn || typeof fn !== 'function') {
    return { blocked: false, reason: '' }
  }

  try {
    const result = (fn as (t: string) => unknown)(input)
    // gate 可能是同步或异步，这里只处理同步（hook 不支持 async）
    if (result && typeof result === 'object' && 'gate' in result) {
      const r = result as { gate: { action: string }; verdict?: string; findings?: Array<{ dimension: string; guidance?: string }> }
      if (r.gate.action === 'block') {
        const reasons = (r.findings || [])
          .map(f => `[${f.dimension}] ${f.guidance || ''}`)
          .join('; ')
        return {
          blocked: true,
          reason: `HeartFlow [${mode === 'input' ? '输入' : '输出'}拦截] ${r.verdict || r.gate.action}: ${reasons}`,
        }
      }
    }
  } catch (e) {
    console.error(`[heartflow] 判别异常: ${(e as Error).message}`)
  }

  return { blocked: false, reason: '' }
}

// ─── 读取 stdin ──────────────────────────────────────────────
let stdin = ''
if (process.stdin.isTTY) {
  // 无 stdin 时尝试命令行参数
  stdin = process.argv.slice(2).join(' ') || ''
} else {
  stdin = readFileSync(0, 'utf-8')
}

let payload: Record<string, unknown> = {}
try {
  payload = JSON.parse(stdin)
} catch {
  // 非 JSON，把整段当作文本
  payload = { prompt: stdin }
}

const event = (payload.event as string) || ''
const prompt = (payload.prompt as string) || ''
const lastMessage = (payload.last_assistant_message as string) || ''

if (event === 'UserPromptSubmit') {
  // 检查用户输入
  const result = check(prompt || '', 'input')
  if (result.blocked) {
    console.error(result.reason)
    process.exit(1)
  }
  console.log('[heartflow] 输入通过')
  process.exit(0)
}

if (event === 'Stop') {
  // 检查 AI 输出
  const text = lastMessage || ''
  if (!text) {
    process.exit(0)
  }
  const result = check(text, 'output')
  if (result.blocked) {
    console.error(result.reason)
    process.exit(1)
  }
  console.log('[heartflow] 输出通过')
  process.exit(0)
}

// 其他事件直接放行
process.exit(0)
