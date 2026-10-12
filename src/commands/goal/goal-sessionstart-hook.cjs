#!/usr/bin/env node
/**
 * Goal SessionStart Hook — /goal 的跨会话恢复提示
 *
 * 在 SessionStart（startup / resume / clear / compact）时触发：
 *   读 .claude/goals/active.json，若存在活跃目标，通过 additionalContext
 *   提示模型与用户"目标仍活跃"，引导用 /goal status 查看、/goal resume 继续。
 *
 * 背景：/clear 会 regenerateSessionId()，使会话内注册的 Stop hook 失效
 * （会话 hook 为内存态、以 sessionId 为键）。本 hook 不负责重注册（command
 * 子进程无法操作主进程内存态会话 hook），重注册由 /goal 命令入口自愈完成；
 * 这里只负责"告知"，避免用户误以为目标已消失。
 *
 * 输出协议（见 src/utils/hooks.ts:725-733）：
 *   { "hookSpecificOutput": { "hookEventName": "SessionStart",
 *       "additionalContext": "<文本>" } }
 *   无活跃目标时输出 {}（不干预）。
 */

'use strict'

const fs = require('fs')
const path = require('path')

function readGoal(cwd) {
  try {
    const raw = fs.readFileSync(
      path.join(cwd, '.claude', 'goals', 'active.json'),
      'utf-8',
    )
    const g = JSON.parse(raw)
    return g && typeof g.objective === 'string' ? g : null
  } catch {
    return null
  }
}

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  raw += chunk
})
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw || '{}')
    const cwd = input.cwd || process.cwd()
    const source = input.source || 'startup'
    const goal = readGoal(cwd)

    if (!goal) {
      process.stdout.write('{}')
      process.exit(0)
    }

    const status = goal.status || 'active'
    const iterations = (goal.usage && goal.usage.iterations) || 0
    const criteria =
      Array.isArray(goal.criteria) && goal.criteria.length > 0
        ? `（成功标准：${goal.criteria.join('；')}）`
        : ''

    let context
    if (status === 'active') {
      context =
        `[goal] 检测到活跃目标：${goal.objective}${criteria}，已完成 ${iterations} 轮。\n` +
        `该目标在会话清除后依然保留。若需继续推进，请让用户运行 /goal status 查看进度、` +
        `/goal resume 重新武装裁判并继续（会话清除会丢失裁判驱动，需重新注册）。`
    } else if (status === 'paused' || status === 'budget_limited') {
      context =
        `[goal] 存在${status === 'paused' ? '已暂停' : '预算耗尽'}的目标：${goal.objective}${criteria}。\n` +
        `如需继续，请提示用户运行 /goal resume。`
    } else {
      // complete / impossible / error：无需提示
      process.stdout.write('{}')
      process.exit(0)
    }

    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: context,
        },
      }),
    )
  } catch {
    // 解析失败：不干预
    process.stdout.write('{}')
  }
  process.exit(0)
})
