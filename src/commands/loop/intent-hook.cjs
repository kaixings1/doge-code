#!/usr/bin/env node
/**
 * Loop Intent Hook — UserPromptSubmit 内置钩子
 *
 * 用途：在用户消息提交给模型之前，检测"直到 X … 直到 Y"这类循环指令，
 * 命中时通过 additionalContext 注入循环执行指令，引导模型以循环方式执行。
 *
 * 配置到 settings.json：
 * ```json
 * {
 *   "hooks": {
 *     "UserPromptSubmit": [
 *       {
 *         "hooks": [
 *           {
 *             "type": "command",
 *             "command": "node src/commands/loop/intent-hook.cjs",
 *             "timeout": 10
 *           }
 *         ]
 *       }
 *     ]
 *   }
 * }
 * ```
 *
 * 输入（stdin）：hook 输入 JSON，含 { prompt, session_id, ... }
 * 输出（stdout）：hook 输出 JSON：
 *   { "hookSpecificOutput": { "hookEventName": "UserPromptSubmit", "additionalContext": "..." } }
 *   未命中时输出空对象 {}（表示不干预）。
 */

'use strict'

// ─── 自包含解析逻辑（不依赖 TS 编译产物）───────────────────────────

const TRIGGER_RE = /直到|直至|为止|循环|反复|迭代|不断|重复|持续|until|while|repeat\s+until/i

const CONDITION_RES = [
  /直到([^，。；,;]+)/g,
  /直至([^，。；,;]+)/g,
  /一直(?:到|至)([^，。；,;]+)/g,
  /循环(?:到|至)([^，。；,;]+)/g,
  /循环执行[^，。；,;]*直到([^，。；,;]+)/g,
  /until\s+([^.,;]+)/gi,
  /till\s+([^.,;]+)/gi,
]

function extractConditions(text) {
  const out = []
  for (const re of CONDITION_RES) {
    const r = new RegExp(re.source, 'g')
    let m
    while ((m = r.exec(text)) !== null) {
      const c = (m[1] || '').trim().replace(/(为止|就可以了|就行|即可|才算完成)$/g, '').trim()
      if (c && !out.includes(c)) out.push(c)
      if (m.index === r.lastIndex) r.lastIndex++
    }
  }
  return out
}

function cleanGoal(raw, conditions) {
  let goal = raw.trim()
  for (const cond of conditions) {
    const esc = cond.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    goal = goal.replace(
      new RegExp(
        '(?:直到|直至|一直(?:到|至)|循环(?:到|至)|循环执行[^，。；,;]*直到|until|till)\\s*' +
          esc,
        'gi',
      ),
      '',
    )
    goal = goal.replace(
      new RegExp('(?:直到|直至)[^，。；,;]*' + esc, 'g'),
      '',
    )
  }
  goal = goal
    .replace(/(?:利用|使用|调用|借助|通过)\s*[A-Za-z][A-Za-z0-9_.-]*(?:工具)?(?:\s*(?:来|去)?\s*(?:检查|测试|验证|实现|构建|编写|执行|运行|操作|调试)(?:\s*(?:检查|测试|验证|实现|构建|编写|执行|运行|操作|调试))?)?/g, '')
    .replace(/(?:利用|使用|调用|借助|通过)\s*[\u4e00-\u9fa5]{1,6}?(?:工具)?(?:\s*(?:来|去)?\s*(?:检查|测试|验证|实现|构建|编写|执行|运行|操作|调试)(?:\s*(?:检查|测试|验证|实现|构建|编写|执行|运行|操作|调试))?)?/g, '')
    .replace(/(请|帮我|麻烦你|请你)?(循环|反复|迭代|重复|持续|不断)(地|的|执行|进行|做)?/g, '')
    .replace(/(请|帮我|麻烦你|请你)?(循环|反复|迭代|重复|持续|不断)/g, '')
    .replace(/keep\s+(?:going|trying|doing)\s*/gi, '')
    .replace(/repeat\s+(?:until|till)\s*/gi, '')
    .replace(/until\s+[^.,;]+/gi, '')
    .replace(/till\s+[^.,;]+/gi, '')
    .replace(/[，。；、,;]+/g, ',')
    .replace(/^[,，：:\s]+/, '')
    .replace(/[,，：:\s]+$/, '')
    .replace(/[,，]+/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/(为止|就可以了|就行|即可|才算完成)$/g, '')
    .replace(/[,，：:\s]+$/, '')
    .trim()
  return goal
}

function isLoopIntent(text) {
  const t = (text || '').trim()
  if (!t || t.length < 4 || t.startsWith('/')) return false
  // 排除已由本系统注入的循环引擎指令标记，防止反复解析同一指令
  if (t.includes('[循环引擎指令]')) return false
  if (!TRIGGER_RE.test(t)) return false
  return /直到|直至|一直(?:到|至)|循环(?:到|至|执行)|until|till|repeat\s+until/i.test(t)
}

function buildInstruction(text) {
  const conditions = extractConditions(text)
  const goal = cleanGoal(text, conditions)
  if (!goal) return null
  const lines = [
    '[循环引擎指令] 用户要求以循环方式执行任务，请持续迭代直到满足所有成功标准：',
    `  目标: ${goal}`,
  ]
  if (conditions.length > 0) {
    lines.push('  成功标准:')
    for (const c of conditions) lines.push(`    - ${c}`)
  }
  lines.push('  终止条件: 所有成功标准均满足后停止循环并汇报结果。')
  return lines.join('\n')
}

// ─── 入口 ─────────────────────────────────────────────────────────

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  raw += chunk
})
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw || '{}')
    const prompt = input.prompt || input.message || ''
    const instruction = isLoopIntent(prompt) ? buildInstruction(prompt) : null
    if (instruction) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'UserPromptSubmit',
            additionalContext: instruction,
          },
        }),
      )
    } else {
      // 未命中：输出空对象，不干预
      process.stdout.write('{}')
    }
  } catch (err) {
    // 解析失败：不干预（静默退出）
    process.stdout.write('{}')
  }
  process.exit(0)
})
