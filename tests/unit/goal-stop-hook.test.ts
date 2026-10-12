/**
 * goal Stop hook 端到端测试
 *
 * 以子进程方式执行 src/commands/goal/goal-stop-hook.cjs，
 * 通过 stdin 喂 hook 输入 JSON、断言 stdout 控制 JSON 与 active.json 落盘结果。
 *
 * 覆盖路径：
 *  - 无目标 / stop_hook_active / 非 active → {} 放行
 *  - 预算超限 → {continue:false} + status=budget_limited
 *  - 裁判 MISSING → {decision:block} + status=active
 *  - 裁判 EVIDENCE → {continue:false} + status=complete
 *  - 裁判 IMPOSSIBLE → {continue:false} + status=impossible
 *  - 裁判不可用 → systemMessage 警告 + 记录 error（不阻断会话）
 *  - 停滞熔断 → {continue:false} + status=paused
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

const REPO = path.resolve(__dirname, '..', '..')
const HOOK = path.join(REPO, 'src', 'commands', 'goal', 'goal-stop-hook.cjs')

const TMP = path.join(os.tmpdir(), `goal-hook-test-${process.pid}`)
const GOALS_DIR = path.join(TMP, '.claude', 'goals')
const ACTIVE = path.join(GOALS_DIR, 'active.json')

async function writeActive(obj: unknown) {
  await fs.mkdir(GOALS_DIR, { recursive: true })
  await fs.writeFile(ACTIVE, JSON.stringify(obj, null, 2), 'utf-8')
}

async function readActive() {
  return JSON.parse(await fs.readFile(ACTIVE, 'utf-8'))
}

async function removeActive() {
  try {
    await fs.unlink(ACTIVE)
  } catch {
    /* ignore */
  }
}

function makeGoal(over: Record<string, unknown> = {}) {
  return {
    id: 'g',
    objective: '让测试通过',
    criteria: [],
    status: 'active',
    budget: { maxIterations: 10, tokenBudget: 0, wallClockMs: 0 },
    usage: {
      iterations: 0,
      tokenUsed: 0,
      startedAt: Date.now(),
      lastIterationAt: Date.now(),
    },
    history: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...over,
  }
}

/**
 * 运行 hook 脚本（异步），返回 stdout 解析后的对象。
 *
 * 注意：必须用异步 spawn——同步 spawnSync 会阻塞本进程事件循环，
 * 使同进程内的 mock HTTP 服务器无法响应子进程请求，导致 hook 内 fetch 超时。
 */
function runHook(
  input: Record<string, unknown>,
  env: Record<string, string> = {},
): Promise<{ stdout: string; json: any }> {
  return new Promise(resolve => {
    const child = spawn('node', [HOOK], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    child.stdout.on('data', c => (stdout += c))
    child.on('close', () => {
      const trimmed = stdout.trim()
      let json: any = null
      try {
        json = JSON.parse(trimmed)
      } catch {
        /* leave null */
      }
      resolve({ stdout: trimmed, json })
    })
    child.stdin.end(JSON.stringify({ cwd: TMP, stop_hook_active: false, ...input }))
  })
}

/** 启动 mock 裁判服务器 */
function startMockJudge(verdict: string): Promise<{ server: Server; port: number }> {
  return new Promise(resolve => {
    const server = createServer((req, res) => {
      let body = ''
      req.on('data', c => (body += c))
      req.on('end', () => {
        const ok = /^EVIDENCE/i.test(verdict)
        const payload = {
          choices: [
            { message: { role: 'assistant', content: JSON.stringify({ ok, reason: verdict }) } },
          ],
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(payload))
      })
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({ server, port })
    })
  })
}

/** 启动返回指定 HTTP 错误的 mock 裁判服务器 */
function startMockJudgeError(
  status: number,
  message: string,
): Promise<{ server: Server; port: number }> {
  return new Promise(resolve => {
    const server = createServer((req, res) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { message } }))
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({ server, port })
    })
  })
}

let mockMissing: { server: Server; port: number }
let mockEvidence: { server: Server; port: number }
let mockImpossible: { server: Server; port: number }

beforeAll(async () => {
  await fs.mkdir(GOALS_DIR, { recursive: true })
  mockMissing = await startMockJudge('MISSING: 还有 2 个测试失败')
  mockEvidence = await startMockJudge('EVIDENCE: 测试输出 0 failed')
  mockImpossible = await startMockJudge('IMPOSSIBLE: 目标引用的文件不存在')
})

afterAll(async () => {
  mockMissing?.server.close()
  mockEvidence?.server.close()
  mockImpossible?.server.close()
  await fs.rm(TMP, { recursive: true, force: true })
})

describe('goal Stop hook', () => {
  it('无 active.json → 放行 {}', async () => {
    await removeActive()
    const { json } = await runHook({})
    expect(json).toEqual({})
  })

  it('stop_hook_active=true → 放行 {}（防递归）', async () => {
    await writeActive(makeGoal())
    const { json } = await runHook({ stop_hook_active: true })
    expect(json).toEqual({})
  })

  it('status≠active → 放行 {}', async () => {
    await writeActive(makeGoal({ status: 'paused' }))
    const { json } = await runHook({})
    expect(json).toEqual({})
  })

  it('迭代达上限 → continue:false 且 status=budget_limited', async () => {
    await writeActive(makeGoal({ budget: { maxIterations: 2, tokenBudget: 0, wallClockMs: 0 }, usage: { iterations: 1, tokenUsed: 0, startedAt: Date.now(), lastIterationAt: Date.now() } }))
    const { json } = await runHook({})
    expect(json.continue).toBe(false)
    expect(String(json.stopReason)).toContain('迭代上限')
    const a = await readActive()
    expect(a.status).toBe('budget_limited')
    expect(a.usage.iterations).toBe(2)
  })

  it('token 达上限 → continue:false', async () => {
    await writeActive(makeGoal({ budget: { maxIterations: 10, tokenBudget: 100, wallClockMs: 0 }, usage: { iterations: 0, tokenUsed: 100, startedAt: Date.now(), lastIterationAt: Date.now() } }))
    const { json } = await runHook({})
    expect(json.continue).toBe(false)
    expect(String(json.stopReason)).toContain('token 预算')
  })

  it('裁判 MISSING → decision:block 且 status 保持 active', async () => {
    await writeActive(makeGoal())
    const { json } = await runHook({}, {
      DOGE_API_KEY: 'fake',
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${mockMissing.port}/v1/chat/completions`,
    })
    expect(json.decision).toBe('block')
    const a = await readActive()
    expect(a.status).toBe('active')
    expect(a.lastJudge.ok).toBe(false)
    expect(a.lastJudge.impossible).toBe(false)
  })

  it('裁判 EVIDENCE → continue:false 且 status=complete', async () => {
    await writeActive(makeGoal())
    const { json } = await runHook({}, {
      DOGE_API_KEY: 'fake',
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${mockEvidence.port}/v1/chat/completions`,
    })
    expect(json.continue).toBe(false)
    const a = await readActive()
    expect(a.status).toBe('complete')
    expect(a.completedAt).toBeTypeOf('number')
  })

  it('裁判 IMPOSSIBLE → continue:false 且 status=impossible', async () => {
    await writeActive(makeGoal())
    const { json } = await runHook({}, {
      DOGE_API_KEY: 'fake',
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${mockImpossible.port}/v1/chat/completions`,
    })
    expect(json.continue).toBe(false)
    const a = await readActive()
    expect(a.status).toBe('impossible')
    expect(a.lastJudge.impossible).toBe(true)
  })

  it('裁判不可用（无 key）→ systemMessage 警告 + 记录 error，状态保留 active', async () => {
    await writeActive(makeGoal())
    const { json } = await runHook({}, { DOGE_API_KEY: '', ANTHROPIC_API_KEY: '' })
    // 不阻止会话，但必须显式告知用户（不再静默 {}）
    expect(json.systemMessage).toBeTypeOf('string')
    expect(json.systemMessage).toContain('裁判不可用')
    expect(json.systemMessage).toContain('DOGE_API_KEY')
    expect(json.continue).toBeUndefined()
    const a = await readActive()
    expect(a.status).toBe('active')
    expect(a.history.some((e: any) => e.type === 'error')).toBe(true)
  })

  it('裁判不可用且已警告过 → 不重复刷屏（返回 {}）', async () => {
    await writeActive(
      makeGoal({
        history: [{ type: 'error', timestamp: Date.now(), detail: '裁判不可用：未配置 DOGE_API_KEY / ANTHROPIC_API_KEY' }],
      }),
    )
    const { json } = await runHook({}, { DOGE_API_KEY: '', ANTHROPIC_API_KEY: '' })
    expect(json).toEqual({})
  })

  it('裁判端点 HTTP 错误 → systemMessage 含状态码与 model', async () => {
    await writeActive(makeGoal())
    const { server, port } = await startMockJudgeError(400, '模型不存在: bad-model')
    const { json } = await runHook(
      {},
      {
        DOGE_API_KEY: 'fake',
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}/v1/chat/completions`,
        DOGE_GOAL_JUDGE_MODEL: 'bad-model',
      },
    )
    server.close()
    expect(json.systemMessage).toContain('HTTP 400')
    expect(json.systemMessage).toContain('bad-model')
  })

  it('停滞熔断：连续 3 条相似 judge_not_ok → continue:false 且 status=paused', async () => {
    const detail = 'MISSING: 测试尚未全部通过 还有 3 个失败'
    await writeActive(
      makeGoal({
        usage: { iterations: 3, tokenUsed: 0, startedAt: Date.now(), lastIterationAt: Date.now() },
        history: [
          { type: 'judge_not_ok', timestamp: Date.now() - 3000, detail },
          { type: 'judge_not_ok', timestamp: Date.now() - 2000, detail },
          { type: 'judge_not_ok', timestamp: Date.now() - 1000, detail },
        ],
      }),
    )
    const { json } = await runHook({}, {
      DOGE_API_KEY: 'fake',
      ANTHROPIC_BASE_URL: `http://127.0.0.1:${mockMissing.port}/v1/chat/completions`,
    })
    expect(json.continue).toBe(false)
    expect(String(json.stopReason)).toContain('停滞')
    const a = await readActive()
    expect(a.status).toBe('paused')
  })

  it('非法输入 JSON → 安全放行 {}', async () => {
    const { json } = await new Promise<any>(resolve => {
      const child = spawn('node', [HOOK], { stdio: ['pipe', 'pipe', 'pipe'] })
      let out = ''
      child.stdout.on('data', c => (out += c))
      child.on('close', () => {
        let json: any = null
        try {
          json = JSON.parse(out.trim())
        } catch {
          /* leave null */
        }
        resolve({ json })
      })
      child.stdin.end('not-json{{{')
    })
    expect(json).toEqual({})
  })
})
