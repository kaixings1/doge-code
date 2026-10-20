/**
 * 回归保护：TeamRunner.resume 必须是真正的断点续跑。
 *
 * 历史缺陷：resume 调用 submitAndRun，后者 engine.submit 会创建**新任务**并从头
 * 执行；原任务的 checkpoint 完全不被使用，原任务也永远停在 paused/failed。
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createTeamRunner } from '../../engine/orchestrator/teamRunner.js'

let dir: string | undefined

afterEach(() => {
  if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  dir = undefined
})

function seedPausedTask(tasksDir: string): void {
  mkdirSync(tasksDir, { recursive: true })
  const task = {
    id: 'task-42',
    status: 'paused',
    description: 'resume me',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentStep: 1, // 已完成第 0 步
    totalSteps: 1,
    checkpoints: [
      {
        step: 0,
        timestamp: new Date().toISOString(),
        action: 'orchestration',
        result: 'previous work',
        filesModified: [],
      },
    ],
    workingDir: tasksDir,
  }
  writeFileSync(join(tasksDir, 'task-42.json'), JSON.stringify(task, null, 2), 'utf-8')
}

describe('TeamRunner.resume', () => {
  it('复用原任务 id 续跑，而不是新建任务', async () => {
    dir = mkdtempSync(join(tmpdir(), 'doge-resume-'))
    seedPausedTask(dir)

    const runner = createTeamRunner({
      taskEngineOptions: { tasksDir: dir },
      orchestratorConfig: { mode: 'pipeline' },
      llmCall: async () => 'output',
    })

    const resumed = await runner.resume('task-42')

    // 关键：必须还是同一个任务
    expect(resumed.id).toBe('task-42')
    // 原有 checkpoint 必须保留（证明不是从头新建）
    expect(resumed.checkpoints[0]?.result).toBe('previous work')

    // 任务数必须仍为 1（没有新建）
    const files = (await import('node:fs')).readdirSync(dir).filter(f => f.endsWith('.json'))
    expect(files).toEqual(['task-42.json'])
  })

  it('任务不存在时抛出明确错误', async () => {
    dir = mkdtempSync(join(tmpdir(), 'doge-resume-'))
    const runner = createTeamRunner({
      taskEngineOptions: { tasksDir: dir },
      orchestratorConfig: { mode: 'pipeline' },
      llmCall: async () => 'output',
    })

    await expect(runner.resume('missing')).rejects.toThrow(/Task not found/)
  })
})
