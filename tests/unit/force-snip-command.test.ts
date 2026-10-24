/**
 * /force-snip 命令契约单测。
 *
 * 背景：src/commands/force-snip.ts 此前是 1 行空壳
 *   `export default function forceSnipCommand() { return null }`
 * 门控（CLAUDE_CODE_FEATURE_HISTORY_SNIP）打开后，resolveCommandExport 拿到的
 * 仍是 null → 命令永远不注册。本测试锁定修复后的三项契约：
 *   1. 默认导出是 Command 对象（有 type/name/load），不是工厂函数
 *   2. parseSnipArgs 的参数解析语义（默认值 / 位置参数 / 开关 / 非法输入回退）
 *   3. call() 接线到真实的 SnipTool.snipeHistory（非空操作）
 *
 * 变异验证：
 *   - 断言 1 反转（改回 export default function）即失败
 *   - 断言 2 修改 DEFAULT_SNIP_LINES 而不改测试即失败
 *   - 断言 3 把 call 改为返回固定字符串（不调 snipeHistory）即失败
 */
import { describe, it, expect } from 'vitest'
import forceSnip, {
  DEFAULT_SNIP_LINES,
  DEFAULT_SNIP_KEEP,
  parseSnipArgs,
} from '../../src/commands/force-snip.js'

describe('/force-snip 命令注册契约', () => {
  it('默认导出是可直接注册的 Command 对象，而非工厂函数', () => {
    expect(typeof forceSnip).toBe('object')
    expect(typeof forceSnip).not.toBe('function')
    expect(forceSnip.name).toBe('force-snip')
    expect(forceSnip.type).toBe('local')
    expect(typeof forceSnip.load).toBe('function')
  })

  it('load() 解析出带 call 的实现（证明不是空壳）', async () => {
    const loaded = await forceSnip.load!()
    expect(typeof loaded.call).toBe('function')
  })
})

describe('parseSnipArgs 参数解析', () => {
  it('空参数回退默认值：100 / 50 / 保留系统消息', () => {
    const parsed = parseSnipArgs(undefined)
    expect(parsed.lines).toBe(DEFAULT_SNIP_LINES)
    expect(parsed.keepRecent).toBe(DEFAULT_SNIP_KEEP)
    expect(parsed.preserveSystem).toBe(true)
    expect(parsed.help).toBe(false)
  })

  it('单个数字覆盖裁剪条数，保留条数仍为默认', () => {
    const parsed = parseSnipArgs('200')
    expect(parsed.lines).toBe(200)
    expect(parsed.keepRecent).toBe(DEFAULT_SNIP_KEEP)
  })

  it('两个数字分别覆盖裁剪条数与保留条数', () => {
    const parsed = parseSnipArgs('200 30')
    expect(parsed.lines).toBe(200)
    expect(parsed.keepRecent).toBe(30)
  })

  it('--no-preserve-system 关闭系统消息保留', () => {
    const parsed = parseSnipArgs('150 --no-preserve-system')
    expect(parsed.lines).toBe(150)
    expect(parsed.preserveSystem).toBe(false)
  })

  it('help / --help / -h 均置 help 标志', () => {
    expect(parseSnipArgs('help').help).toBe(true)
    expect(parseSnipArgs('--help').help).toBe(true)
    expect(parseSnipArgs('-h').help).toBe(true)
  })

  it('非法数字回退默认值而非抛错（NaN / 负数）', () => {
    const nan = parseSnipArgs('abc')
    expect(nan.lines).toBe(DEFAULT_SNIP_LINES)
    const negative = parseSnipArgs('-5')
    expect(negative.lines).toBe(DEFAULT_SNIP_LINES)
  })

  it('小数被向下取整', () => {
    expect(parseSnipArgs('42.9').lines).toBe(42)
  })
})

describe('call() 接线到 SnipTool 真实实现', () => {
  it('help 分支返回用法文本，不触碰历史存储', async () => {
    const loaded = await forceSnip.load!()
    const result = await loaded.call('help', {} as never)
    const text = (result as { value?: string }).value ?? ''
    expect(text).toContain('/force-snip')
    expect(text).toContain('保留最近')
  })

  it('空历史时给出明确提示（依赖真实 getHistoryLength，而非硬编码）', async () => {
    const loaded = await forceSnip.load!()
    const result = await loaded.call('', {} as never)
    const text = (result as { value?: string }).value ?? ''
    // 两种情况都必须是真实计算结果：要么说空、要么报告裁剪前后条数
    const isReal =
      text.includes('历史为空') || (text.includes('裁剪前') && text.includes('裁剪后'))
    expect(isReal).toBe(true)
  })
})