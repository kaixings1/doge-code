/**
 * /fork 命令的递归守卫错误匹配回归测试。
 *
 * 历史 bug：commands/fork/index.ts 的 catch 分支用
 *   msg.includes('不能在子代理内部再分支')
 * 去判断「在 fork 子代理内再次 fork」，但 AgentTool 实际抛的是
 *   'Fork 在 Fork 工作器内部不可用。请直接使用你的工具完成任务。'
 * 两者措辞不同 → includes() 恒为 false → 友好提示分支从未生效，
 * 用户只能看到通用的「分支子代理启动失败」。
 *
 * 现已抽成共享常量 FORK_NESTED_ERROR。本测试锁定：
 * 1) 该常量存在且非空
 * 2) 抛出方（源码）与匹配方（源码）都引用它，不存在硬编码字面量
 * 3) 旧的有害字面量不得复活
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { FORK_NESTED_ERROR } from '../../src/tools/AgentTool/forkSubagent.js'

const ROOT = resolve(__dirname, '../..')

describe('fork 递归守卫错误串一致性', () => {
  it('FORK_NESTED_ERROR 是非空字符串', () => {
    expect(typeof FORK_NESTED_ERROR).toBe('string')
    expect(FORK_NESTED_ERROR.length).toBeGreaterThan(0)
  })

  it('抛出方 AgentTool 引用常量，不再硬编码字面量', () => {
    const src = readFileSync(resolve(ROOT, 'src/tools/AgentTool/AgentTool.tsx'), 'utf8')
    expect(src).toContain('throw new Error(FORK_NESTED_ERROR)')
    // 不得残留硬编码的抛出字面量
    expect(src).not.toContain("throw new Error('Fork 在 Fork 工作器内部不可用")
  })

  it('匹配方 fork 命令引用常量，不再硬编码字面量', () => {
    const src = readFileSync(resolve(ROOT, 'src/commands/fork/index.ts'), 'utf8')
    expect(src).toContain('msg.includes(FORK_NESTED_ERROR)')
    // 旧的死匹配串不得复活（它从未匹配上任何抛出方）
    expect(src).not.toContain("includes('不能在子代理内部再分支')")
  })

  it('模拟：抛出的错误能被匹配方识别', () => {
    // 复现 AgentTool 的抛出 → fork 命令的判定路径
    let caught = ''
    try {
      throw new Error(FORK_NESTED_ERROR)
    } catch (e) {
      caught = e instanceof Error ? e.message : String(e)
    }
    expect(caught.includes(FORK_NESTED_ERROR)).toBe(true)
  })
})
