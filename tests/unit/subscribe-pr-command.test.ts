/**
 * /subscribe-pr 命令契约单测。
 *
 * 背景：src/commands/subscribe-pr.ts 此前是 1 行空壳
 *   `export default function subscribePrCommand() { return null }`
 * 门控（CLAUDE_CODE_FEATURE_KAIROS_GITHUB_WEBHOOKS）打开后仍拿不到命令。
 *
 * 本测试锁定：
 *   1. 默认导出是 Command 对象（非工厂函数）
 *   2. parseSubscribePrArgs 的解析语义（action / owner-repo / pr / --port / --limit / 未知动作）
 *   3. call() 接线到真实 SubscribePRTool（用本地 action=list 走通，不触网）
 *
 * 变异验证：
 *   - 断言 2 把 repo 识别逻辑从「含 /」改为「首个 token」即失败
 *   - 断言 2 移除未知动作 → help 的分支即失败
 *   - 断言 3 若 call 不调用 tool.execute 而返回固定串，则 list 分支不会出现订阅表头
 */
import { describe, it, expect } from 'vitest'
import subscribePrCommand, { parseSubscribePrArgs } from '../../src/commands/subscribe-pr.js'

describe('/subscribe-pr 命令注册契约', () => {
  it('默认导出是可直接注册的 Command 对象，而非工厂函数', () => {
    expect(typeof subscribePrCommand).toBe('object')
    expect(typeof subscribePrCommand).not.toBe('function')
    expect(subscribePrCommand.name).toBe('subscribe-pr')
    expect(subscribePrCommand.type).toBe('local')
    expect(typeof subscribePrCommand.load).toBe('function')
  })

  it('load() 解析出带 call 的实现（证明不是空壳）', async () => {
    const loaded = await subscribePrCommand.load!()
    expect(typeof loaded.call).toBe('function')
  })
})

describe('parseSubscribePrArgs 参数解析', () => {
  it('空参数默认 action=list', () => {
    const parsed = parseSubscribePrArgs(undefined)
    expect(parsed.action).toBe('list')
    expect(parsed.repo).toBe('')
    expect(parsed.pr).toBe(0)
  })

  it('解析 subscribe + owner/repo + pr 号', () => {
    const parsed = parseSubscribePrArgs('subscribe anthropics/claude-code 123')
    expect(parsed.action).toBe('subscribe')
    expect(parsed.repo).toBe('anthropics/claude-code')
    expect(parsed.pr).toBe(123)
  })

  it('解析 --port 与 --limit 选项', () => {
    const withPort = parseSubscribePrArgs('webhook-start --port 45680')
    expect(withPort.action).toBe('webhook-start')
    expect(withPort.port).toBe(45680)

    const withLimit = parseSubscribePrArgs('webhook-events --limit 50')
    expect(withLimit.limit).toBe(50)
  })

  it('未知动作置 help 标志（引导用户看用法）', () => {
    expect(parseSubscribePrArgs('not-an-action').help).toBe(true)
  })

  it('help / --help 置 help 标志', () => {
    expect(parseSubscribePrArgs('help').help).toBe(true)
    expect(parseSubscribePrArgs('--help').help).toBe(true)
  })

  it('repo 按「含 /」识别，而非取首个参数', () => {
    const parsed = parseSubscribePrArgs('poll my-org/my-repo')
    expect(parsed.action).toBe('poll')
    expect(parsed.repo).toBe('my-org/my-repo')
    // poll 无需 pr 号
    expect(parsed.pr).toBe(0)
  })
})

describe('call() 接线到真实 SubscribePRTool', () => {
  it('help 分支返回用法文本', async () => {
    const loaded = await subscribePrCommand.load!()
    const result = await loaded.call('help', {} as never)
    const text = (result as { value?: string }).value ?? ''
    expect(text).toContain('/subscribe-pr')
    expect(text).toContain('webhook-start')
  })

  it('list 分支返回订阅表头（证明真的调用了 tool.execute）', async () => {
    const loaded = await subscribePrCommand.load!()
    const result = await loaded.call('list', {} as never)
    const text = (result as { value?: string }).value ?? ''
    // 真实 SubscribePRTool.execute('list') 会返回 '## Subscribed PRs' 或 '暂无订阅'
    const isReal = text.includes('Subscribed PRs') || text.includes('暂无订阅')
    expect(isReal).toBe(true)
  })
})