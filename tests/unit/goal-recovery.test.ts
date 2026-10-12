/**
 * 阶段四：跨 /clear 恢复 与 SessionStart hook 测试
 *
 * 覆盖：
 *  - 会话锚点读写（writeSessionAnchor / clearGoal 清理）
 *  - /clear 语义模拟：sessionId 变更后 active.json 仍在 → loadGoal 可恢复
 *  - SessionStart hook 脚本：无目标 {} / active 提示 / 其他状态不提示 / 容错
 *  - 恢复后状态可继续流转（paused→active）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  createGoal,
  loadGoal,
  saveGoal,
  clearGoal,
  writeSessionAnchor,
  transition,
} from '../../src/services/goal/goalState.js'

const REPO = path.resolve(__dirname, '..', '..')
const SS_HOOK = path.join(REPO, 'src', 'commands', 'goal', 'goal-sessionstart-hook.cjs')

let TMP: string

beforeEach(async () => {
  TMP = await fs.mkdtemp(path.join(os.tmpdir(), 'goal-recovery-'))
})

afterEach(async () => {
  await fs.rm(TMP, { recursive: true, force: true })
})

/** 运行 SessionStart hook，返回解析后的 stdout */
function runSessionStartHook(input: Record<string, unknown>): Promise<any> {
  return new Promise(resolve => {
    const child = spawn('node', [SS_HOOK], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', c => (out += c))
    child.on('close', () => {
      let json: any = null
      try {
        json = JSON.parse(out.trim())
      } catch {
        /* leave null */
      }
      resolve(json)
    })
    child.stdin.end(JSON.stringify({ cwd: TMP, source: 'clear', ...input }))
  })
}

describe('会话锚点', () => {
  it('writeSessionAnchor 写入 sessions/<sessionId>.id，clearGoal 清理', async () => {
    const goal = createGoal('t')
    await saveGoal(TMP, goal)
    await writeSessionAnchor(TMP, 'sess-A', goal.id)

    const anchor = path.join(TMP, '.claude', 'goals', 'sessions', 'sess-A.id')
    expect(await fs.readFile(anchor, 'utf-8')).toBe(goal.id)

    await clearGoal(TMP, 'sess-A')
    await expect(fs.readFile(anchor, 'utf-8')).rejects.toThrow()
  })
})

describe('/clear 恢复语义', () => {
  it('sessionId 变更后 active.json 仍在 → loadGoal 可恢复', async () => {
    const goal = createGoal('跨 clear 存活', { criteria: ['x'] })
    await saveGoal(TMP, goal)
    await writeSessionAnchor(TMP, 'sess-old', goal.id)

    // 模拟 /clear：sessionId 变为 sess-new（regenerateSessionId），
    // active.json 不受影响（clearConversation 不删它）
    const recovered = await loadGoal(TMP)
    expect(recovered).not.toBeNull()
    expect(recovered!.objective).toBe('跨 clear 存活')
    expect(recovered!.status).toBe('active')
    expect(recovered!.criteria).toEqual(['x'])
  })

  it('恢复后可继续流转：paused → active（resume）', async () => {
    const goal = createGoal('t')
    await saveGoal(TMP, goal)
    let g = (await loadGoal(TMP))!
    transition(g, 'paused', 'pause', '暂停')
    await saveGoal(TMP, g)

    g = (await loadGoal(TMP))!
    expect(g.status).toBe('paused')
    expect(transition(g, 'active', 'resume', '恢复')).toBe(true)
    await saveGoal(TMP, g)
    expect((await loadGoal(TMP))!.status).toBe('active')
  })
})

describe('SessionStart hook', () => {
  it('无 active.json → {}', async () => {
    expect(await runSessionStartHook({})).toEqual({})
  })

  it('active 目标 → additionalContext 含目标与轮次', async () => {
    const goal = createGoal('让测试通过', { criteria: ['0 失败'] })
    goal.usage.iterations = 3
    await saveGoal(TMP, goal)
    const out = await runSessionStartHook({})
    expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart')
    const ctx = out.hookSpecificOutput.additionalContext as string
    expect(ctx).toContain('让测试通过')
    expect(ctx).toContain('0 失败')
    expect(ctx).toContain('3 轮')
  })

  it('paused 目标 → 提示 resume', async () => {
    const goal = createGoal('t')
    transition(goal, 'paused', 'pause', '暂停')
    await saveGoal(TMP, goal)
    const out = await runSessionStartHook({})
    expect(String(out.hookSpecificOutput.additionalContext)).toContain('/goal resume')
  })

  it('complete 目标 → 不提示 {}', async () => {
    const goal = createGoal('t')
    transition(goal, 'complete', 'judge_ok', '达成')
    await saveGoal(TMP, goal)
    expect(await runSessionStartHook({})).toEqual({})
  })

  it('非法 JSON → 安全 {}', async () => {
    const json = await new Promise<any>(resolve => {
      const child = spawn('node', [SS_HOOK], { stdio: ['pipe', 'pipe', 'pipe'] })
      let out = ''
      child.stdout.on('data', c => (out += c))
      child.on('close', () => {
        try {
          resolve(JSON.parse(out.trim()))
        } catch {
          resolve(null)
        }
      })
      child.stdin.end('not-json{{{')
    })
    expect(json).toEqual({})
  })
})
