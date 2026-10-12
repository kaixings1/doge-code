#!/usr/bin/env node
/**
 * Goal Stop Hook — /goal 的裁判闭环闸门（内置钩子）
 *
 * 职责（每个 Stop 事件触发一次，即每轮对话结束后）：
 *   1. 从 stdin 读 hook 输入 JSON，取 cwd 定位 .claude/goals/active.json
 *   2. 无活跃目标或 status≠active → 输出 {} 不干预
 *   3. 累加 usage.iterations，落盘
 *   4. 三级预算 / 两级熔断超限 → status=budget_limited/paused + {"continue":false}
 *   5. 否则调用裁判 LLM 判定：
 *        ok:true   → status=complete   + {"continue":false}（达成，停止）
 *        IMPOSSIBLE→ status=impossible + {"continue":false}（不可能，停止）
 *        ok:false  → {"decision":"block","reason":...}（让主模型带着理由续跑）
 *
 * 输出协议（见 src/utils/hooks.ts:616-641）：
 *   {"continue": false, "stopReason": "..."}   停止（preventContinuation）
 *   {"decision": "block", "reason": "..."}      阻塞续跑（blockingError → 主模型继续）
 *   {}                                          不干预
 *
 * 配置：由 /goal 命令通过 addSessionHook 动态注册；亦支持静态配置到 settings.json：
 *   { "hooks": { "Stop": [ { "hooks": [ { "type": "command",
 *       "command": "node <path>/goal-stop-hook.cjs", "timeout": 60 } ] } ] } }
 */

'use strict'

const fs = require('fs')
const path = require('path')

// ─── 常量（与 src/services/goal/types.ts 保持一致） ───────────────
const JUDGE_MISSING_PREFIX = 'MISSING:'
const JUDGE_IMPOSSIBLE_PREFIX = 'IMPOSSIBLE:'

// 三级预算默认值（与 types.ts 的 DEFAULT_BUDGET 对齐）
const DEFAULT_MAX_ITERATIONS = 50
const DEFAULT_WALL_CLOCK_MS = 4 * 60 * 60 * 1000

// 两级熔断参数（与 budget.ts 对齐）
const FAST_LOOP_WINDOW_MS = 60_000
const FAST_LOOP_MAX_TRIGGERS = 3
const FAST_LOOP_TOKEN_FLOOR = 1000
const STAGNATION_THRESHOLD = 3

// ─── 输出助手 ─────────────────────────────────────────────────────
function emit(obj) {
  process.stdout.write(JSON.stringify(obj))
}

function stop(stopReason) {
  emit({ continue: false, stopReason })
}

function block(reason) {
  emit({ decision: 'block', reason })
}

// ─── 状态读写（原子写，与 goalState.ts 对齐） ─────────────────────
function activeFilePath(cwd) {
  return path.join(cwd, '.claude', 'goals', 'active.json')
}

function readGoal(cwd) {
  try {
    const raw = fs.readFileSync(activeFilePath(cwd), 'utf-8')
    const g = JSON.parse(raw)
    if (!g || typeof g.objective !== 'string') return null
    g.criteria = g.criteria || []
    g.budget = g.budget || {}
    g.usage = g.usage || {}
    g.history = g.history || []
    return g
  } catch {
    return null
  }
}

function writeGoal(cwd, goal) {
  const file = activeFilePath(cwd)
  const tmp = `${file}.tmp`
  goal.updatedAt = Date.now()
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(tmp, JSON.stringify(goal, null, 2), 'utf-8')
    fs.renameSync(tmp, file)
  } catch {
    /* 写入失败不致命，下一轮重试 */
  }
}

function pushEvent(goal, type, detail, tokensThisTurn) {
  const ev = { type, timestamp: Date.now(), detail }
  if (tokensThisTurn !== undefined) ev.tokensThisTurn = tokensThisTurn
  goal.history.push(ev)
  goal.updatedAt = ev.timestamp
}

// ─── 三级预算 ─────────────────────────────────────────────────────
function checkBudget(goal, now) {
  const budget = goal.budget || {}
  const usage = goal.usage || {}
  const maxIter = budget.maxIterations != null ? budget.maxIterations : DEFAULT_MAX_ITERATIONS
  const tokenBudget = budget.tokenBudget || 0
  const wallClockMs = budget.wallClockMs != null ? budget.wallClockMs : DEFAULT_WALL_CLOCK_MS

  if (maxIter > 0 && (usage.iterations || 0) >= maxIter) {
    return { exceeded: true, reason: `已达迭代上限（${usage.iterations}/${maxIter}）` }
  }
  if (tokenBudget > 0 && (usage.tokenUsed || 0) >= tokenBudget) {
    return { exceeded: true, reason: `已达 token 预算（${usage.tokenUsed}/${tokenBudget}）` }
  }
  if (wallClockMs > 0 && now - (usage.startedAt || now) >= wallClockMs) {
    const mins = Math.round((now - usage.startedAt) / 60000)
    const limit = Math.round(wallClockMs / 60000)
    return { exceeded: true, reason: `已达时间预算（${mins}/${limit} 分钟）` }
  }
  return { exceeded: false }
}

// ─── 两级熔断 ─────────────────────────────────────────────────────
function detectFastLoop(goal, now) {
  const hb = goal.history.filter(e => e.type === 'iteration_end')
  const recent = hb.filter(e => now - e.timestamp <= FAST_LOOP_WINDOW_MS)
  if (recent.length <= FAST_LOOP_MAX_TRIGGERS) return false
  const tokens = recent.map(e => e.tokensThisTurn || 0)
  return tokens.length > 0 && tokens.every(t => t < FAST_LOOP_TOKEN_FLOOR)
}

function reasonsSimilar(a, b, threshold) {
  const norm = s =>
    String(s || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean)
  const sa = new Set(norm(a))
  const sb = new Set(norm(b))
  if (sa.size === 0 || sb.size === 0) return String(a).trim() === String(b).trim()
  let inter = 0
  for (const w of sa) if (sb.has(w)) inter++
  const union = sa.size + sb.size - inter
  return inter / union >= threshold
}

function detectStagnation(goal) {
  const judgeEvents = goal.history.filter(
    e => e.type === 'judge_not_ok' || e.type === 'judge_impossible',
  )
  if (judgeEvents.length < STAGNATION_THRESHOLD) return false
  const tail = judgeEvents.slice(-STAGNATION_THRESHOLD)
  for (let i = 1; i < tail.length; i++) {
    if (!reasonsSimilar(tail[i - 1].detail, tail[i].detail, 0.8)) return false
  }
  return true
}

// ─── 裁判 LLM 调用 ────────────────────────────────────────────────
function extractAssistantText(hookInput) {
  if (typeof hookInput.last_assistant_message === 'string' && hookInput.last_assistant_message.trim()) {
    return hookInput.last_assistant_message.trim()
  }
  return ''
}

function readTranscriptTail(transcriptPath, maxChars) {
  try {
    const raw = fs.readFileSync(transcriptPath, 'utf-8')
    return raw.length > maxChars ? raw.slice(-maxChars) : raw
  } catch {
    return ''
  }
}

function buildJudgePrompt(goal, hookInput) {
  const criteria =
    goal.criteria && goal.criteria.length > 0
      ? goal.criteria.join('；')
      : '无显式标准，按目标语义判断'
  const usage = goal.usage || {}
  const maxIter = (goal.budget && goal.budget.maxIterations) || DEFAULT_MAX_ITERATIONS

  const assistantText = extractAssistantText(hookInput)
  const transcript = hookInput.transcript_path
    ? readTranscriptTail(hookInput.transcript_path, 8000)
    : ''

  return `你是 Claude Code 的目标达成裁判。只依据给出的证据判断，不要使用任何工具，不要执行命令。

目标（objective）：${goal.objective}
成功标准（criteria）：${criteria}
预算进度：iterations=${usage.iterations || 0}/${maxIter}

最近一轮助手回复：
${assistantText || '（无）'}

对话记录尾部（可能被截断）：
${transcript || '（无）'}

严格判断目标是否已达成。只依据上述内容中的具体证据，不接受无证据的声称。
只返回一个 JSON 对象，不要任何多余文字、不要 markdown 代码块：
- 达成：   {"ok": true,  "reason": "EVIDENCE: <引用满足条件的证据>"}
- 未达成： {"ok": false, "reason": "MISSING: <还缺什么 / 什么阻碍了条件>"}
- 不可能： {"ok": false, "reason": "IMPOSSIBLE: <为何该条件永远无法满足>"}`
}

function parseJudgeJson(text) {
  if (!text) return null
  // 去掉可能的 markdown 代码块围栏
  let s = String(text).trim()
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  // 提取第一个 { 到最后一个 }
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const obj = JSON.parse(s.slice(start, end + 1))
    if (typeof obj.ok !== 'boolean') return null
    return { ok: obj.ok, reason: String(obj.reason || '') }
  } catch {
    return null
  }
}

/**
 * 调用裁判模型。
 *
 * 返回 { verdict, error }：
 *   - 成功：{ verdict: {ok,reason}, error: null }
 *   - 失败：{ verdict: null, error: '<可读原因>' }
 * 区分失败原因，以便向用户给出精确警告（而非静默放行）。
 */
async function callJudge(prompt) {
  const apiKey =
    process.env.DOGE_API_KEY || process.env.ANTHROPIC_API_KEY || ''
  const baseURL =
    process.env.ANTHROPIC_BASE_URL ||
    'https://api.longcat.chat/openai/v1/chat/completions'
  // 模型优先级：显式覆盖 > 环境通用小模型 > 端点通用别名。
  // 注意：不可硬编码具体厂商模型名（如 claude-haiku-*）——本项目端点
  // （ANTHROPIC_BASE_URL）未必提供该模型，会导致裁判静默失效（返回 null 放行）。
  // 'fast-model' 是本端点约定的快速模型别名（实测可用）。
  const model =
    process.env.DOGE_GOAL_JUDGE_MODEL ||
    process.env.DOGE_SMALL_FAST_MODEL ||
    'fast-model'

  if (!apiKey) {
    return { verdict: null, error: '未配置 DOGE_API_KEY / ANTHROPIC_API_KEY' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(baseURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 512,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      let detail = ''
      try {
        const body = await res.json()
        detail = body?.error?.message || body?.message || ''
      } catch {
        /* 响应非 JSON，忽略 */
      }
      return {
        verdict: null,
        error: `裁判端点返回 HTTP ${res.status}${detail ? `：${detail}` : ''}（model=${model}）`,
      }
    }
    const data = await res.json()
    const text =
      (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ||
      (data.content && data.content[0] && data.content[0].text) ||
      ''
    const parsed = parseJudgeJson(text)
    if (!parsed) {
      return { verdict: null, error: `裁判响应无法解析为 JSON（model=${model}）` }
    }
    return { verdict: parsed, error: null }
  } catch (err) {
    const aborted = controller.signal.aborted
    return {
      verdict: null,
      error: aborted
        ? `裁判请求超时（30s，端点 ${baseURL} 可能未启动）`
        : `裁判请求失败：${err && err.message ? err.message : String(err)}`,
    }
  } finally {
    clearTimeout(timeout)
  }
}

// ─── 主流程 ───────────────────────────────────────────────────────
async function handle(input) {
  // stop_hook_active：本调用已处于 Stop 钩子内，直接放行防递归
  if (input.stop_hook_active === true) {
    return emit({})
  }

  const cwd = input.cwd || process.cwd()
  const goal = readGoal(cwd)
  if (!goal) return emit({})
  if (goal.status !== 'active') return emit({})

  const now = Date.now()

  // 1) 累加迭代（每轮迭代在此计入）
  goal.usage.iterations = (goal.usage.iterations || 0) + 1
  goal.usage.lastIterationAt = now
  pushEvent(goal, 'iteration_end', `第 ${goal.usage.iterations} 轮结束`)

  // 2) 预算闸门
  const budget = checkBudget(goal, now)
  if (budget.exceeded) {
    goal.status = 'budget_limited'
    pushEvent(goal, 'budget_exceeded', budget.reason)
    writeGoal(cwd, goal)
    return stop(`已达预算上限，目标暂停：${budget.reason}。用 /goal resume 增加预算后继续。`)
  }

  // 3) 熔断闸门
  if (detectFastLoop(goal, now)) {
    goal.status = 'paused'
    pushEvent(goal, 'circuit_break', '检测到空转循环，已自动暂停')
    writeGoal(cwd, goal)
    return stop('检测到空转循环（短时间内反复触发且进展极低），已自动暂停目标。用 /goal resume 恢复。')
  }
  if (detectStagnation(goal)) {
    goal.status = 'paused'
    pushEvent(goal, 'circuit_break', '检测到进度停滞，已自动暂停')
    writeGoal(cwd, goal)
    return stop('检测到进度停滞（连续多轮裁判理由高度相似），已自动暂停目标。用 /goal resume 恢复。')
  }

  // 4) 裁判判定
  const prompt = buildJudgePrompt(goal, input)
  const { verdict, error } = await callJudge(prompt)

  if (!verdict) {
    // 裁判不可用：不阻止会话（避免破坏正常使用），但显式告知用户，
    // 避免"设了目标却没动静"的静默失效。记录事件 + 输出 systemMessage。
    const detail = error || '未知原因'
    // 首次失败才提示，避免每轮刷屏
    const alreadyWarned = goal.history.some(
      e => e.type === 'error' && String(e.detail).startsWith('裁判不可用'),
    )
    pushEvent(goal, 'error', `裁判不可用：${detail}`)
    writeGoal(cwd, goal)
    if (alreadyWarned) {
      return emit({})
    }
    return emit({
      systemMessage:
        `⚠️ [goal] 裁判不可用，目标"${goal.objective}"本轮未评估：${detail}\n` +
        `目标状态保留，但不会自动推进。请检查裁判端点/模型配置后，运行 /goal resume 重试。`,
    })
  }

  const reason = verdict.reason || ''
  goal.lastJudge = {
    ok: verdict.ok,
    impossible: !verdict.ok && reason.toUpperCase().startsWith(JUDGE_IMPOSSIBLE_PREFIX),
    reason,
    at: now,
  }

  if (verdict.ok) {
    goal.status = 'complete'
    goal.completedAt = now
    pushEvent(goal, 'judge_ok', `达成：${reason}`)
    writeGoal(cwd, goal)
    return stop(`🎯 目标已达成：${reason}`)
  }

  if (goal.lastJudge.impossible) {
    goal.status = 'impossible'
    goal.completedAt = now
    pushEvent(goal, 'judge_impossible', `判定不可能：${reason}`)
    writeGoal(cwd, goal)
    return stop(`⛔ 裁判判定目标不可能达成：${reason}`)
  }

  // 未达成：记录并让主模型带着理由续跑
  pushEvent(goal, 'judge_not_ok', reason.startsWith(JUDGE_MISSING_PREFIX) ? reason : `${JUDGE_MISSING_PREFIX} ${reason}`)
  writeGoal(cwd, goal)
  return block(`目标尚未达成，请继续推进。裁判反馈：${reason}`)
}

// ─── 入口 ─────────────────────────────────────────────────────────
let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  raw += chunk
})
process.stdin.on('end', async () => {
  let input = {}
  try {
    input = JSON.parse(raw || '{}')
  } catch {
    return process.stdout.write('{}') || process.exit(0)
  }
  try {
    await handle(input)
  } catch (err) {
    // 任何异常都不干预（避免破坏会话）
    process.stdout.write('{}')
  }
  process.exit(0)
})
