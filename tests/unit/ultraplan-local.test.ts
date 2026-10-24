/**
 * /ultraplan-local 守卫：本地深度规划命令必须真正可用（非空壳）。
 *
 * 背景：官方 /ultraplan 依赖 CCR 云端 + 浏览器审批，本 fork 没有官方服务，
 * 于是补了本地版。这个测试防止它退化成「只返回一句提示」的空壳。
 *
 * 覆盖：
 * 1. 无参数 → 列计划（含计划目录）
 * 2. --list 与无参数一致
 * 3. --show 不存在的 slug → 明确未找到提示
 * 4. 任务描述 → 提示词含任务原文 + 深度规划要求 + 计划目录
 * 5. 项目里存在 CLAUDE.md 时，文档内容必须被纳入提示词
 * 6. 历史计划能被 --list 列出并被 --show 读到
 *
 * 不做「注册到 COMMANDS」断言：commands.js 导入代价极高（本项目全量导入需 ~30s，
 * 会撞 10s 默认超时），命令可见性由 tests/unit/command-name-uniqueness.test.ts
 * 与 tests/unit/ant0-command-reachability.test.ts 覆盖。
 *
 * 变异验证：call 恒返回 'ok' → 4/5 失败；删掉 docs 拼接 → 5 失败。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  call as callFn,
  formatList,
  listPlanFiles,
} from '../../src/commands/ultraplan-local/ultraplanLocal.js'

let home: string
const ctx = {} as any
const call = callFn as unknown as (args: string, c: any) => Promise<{ type: string; value: string }>

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'doge-uplan-'))
  process.env.CLAUDE_CONFIG_DIR = home
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  delete process.env.CLAUDE_CONFIG_DIR
})

describe('ultraplan-local', () => {
  it('无参数时列出计划（空目录也不崩）', async () => {
    const res = await call('', ctx)
    expect(res.type).toBe('text')
    expect(res.value).toContain('计划目录')
  })

  it('--list 与无参数同义', async () => {
    const a = await call('', ctx)
    const b = await call('--list', ctx)
    expect(b.value).toBe(a.value)
  })

  it('--show 不存在的 slug 给出明确提示', async () => {
    const res = await call('--show no-such-plan-xyz', ctx)
    expect(res.value).toContain('未找到')
    expect(res.value).toContain('--list')
  })

  it('任务描述产出深度规划提示词', async () => {
    const res = await call('实现一个本地 RAG 检索命令', ctx)
    expect(res.type).toBe('text')
    expect(res.value).toContain('实现一个本地 RAG 检索命令')
    expect(res.value).toContain('深度规划')
    expect(res.value).toContain('待确认问题')
    expect(res.value).toContain('计划目录')
  })

  it('项目中的规划文档被纳入上下文', async () => {
    // 依赖仓库真实存在的 CLAUDE.md；不存在则跳过（不伪造项目文件）
    if (!existsSync(join(process.cwd(), 'CLAUDE.md'))) return
    const res = await call('随便一个任务', ctx)
    expect(res.value).toContain('项目文档')
    expect(res.value).not.toContain('（未找到 TASK.md')
  })

  it('历史计划能被 --list 列出并被 --show 读到', async () => {
    const plansDir = join(home, 'plans')
    mkdirSync(plansDir, { recursive: true })
    writeFileSync(join(plansDir, 'demo-plan.md'), '# Demo\n\n这是测试计划内容', 'utf8')

    expect(listPlanFiles().map(f => f.slug)).toContain('demo-plan')
    expect(formatList()).toContain('demo-plan')

    const show = await call('--show demo-plan', ctx)
    expect(show.value).toContain('这是测试计划内容')
  })
})
