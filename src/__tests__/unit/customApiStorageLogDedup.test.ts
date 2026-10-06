import { describe, test, expect, beforeEach, vi } from 'vitest'

// 验证 readCustomApiStorage 的端点日志去重：
// 该函数被 StatusLine/DogeFooterInfo/useMainLoopModel/client 在渲染热路径上
// 每帧同步调用，未去重时同一秒刷 8~10 条完全相同的日志（实测 f.txt 274 条）。
// 去重规则：内容相同 10s 内只记一次；内容变化时立刻重记。
const logged: string[] = []

vi.mock('../../utils/debug.js', () => ({
  logForDebugging: (msg: string) => {
    logged.push(msg)
  },
}))

// 隔离文件系统：让 readProjectStorage / readGlobalStorage 读到可控内容
vi.mock('fs', async importOriginal => {
  const actual = await importOriginal<typeof import('fs')>()
  const { homedir } = await import('os')
  const path = await import('path')
  const globalPath = path.join(homedir(), '.doge', 'providers.json')
  return {
    ...actual,
    existsSync: (p: any) => {
      if (p === globalPath) return true
      return false
    },
    readFileSync: (p: any) => {
      if (p === globalPath) {
        return JSON.stringify({
          activePreset: 'p1',
          presets: {
            p1: { baseURL: 'https://a.example/v1', model: 'm1' },
          },
        })
      }
      throw new Error('unexpected read: ' + p)
    },
    writeFileSync: () => {},
    mkdirSync: () => {},
    statSync: () => ({ mode: 0o100644 }),
    chmodSync: () => {},
  }
})

describe('readCustomApiStorage 端点日志去重', () => {
  beforeEach(() => {
    logged.length = 0
    // 重置模块级去重状态，避免用例间串扰（也反向证明去重是模块级生效的）
    vi.resetModules()
  })

  test('连续相同调用只记一次，且内容含来源/baseURL/model 不含 apiKey', async () => {
    const { readCustomApiStorage } = await import('../../utils/customApiStorage.js')
    for (let i = 0; i < 10; i++) readCustomApiStorage()
    const lines = logged.filter(l => l.includes('[readCustomApiStorage]'))
    // 核心断言：10 次调用只产出 1 条日志（去重生效）
    expect(lines).toHaveLength(1)
    // 日志必须带上排查所需字段
    expect(lines[0]).toContain('端点来源=')
    expect(lines[0]).toContain('baseURL=')
    // 绝不泄漏 apiKey
    expect(lines[0]).not.toContain('apiKey')
  })
})
