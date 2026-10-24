import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SubAgentManager } from '../../src/features/featureFlags.js'

/**
 * WebSearch 会话级上限（对齐官方 CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION，v2.1.212）
 *
 * 修复前的真实缺陷（见 WebSearchTool.ts 原代码注释「仅日志，未实现会话级计数器」）：
 * canSearch() / recordSearch() 全仓零调用点，上限从未生效。
 *
 * 这里覆盖三件事：
 * 1. 计数上限本身的行为（本次直接使用生产类）
 * 2. WebSearchTool 真的会调用 canSearch——通过读取源码断言调用点存在
 *    （不能复刻实现：复刻后生产代码删掉调用，测试仍会通过）
 * 3. 缓存命中不消耗配额这一设计意图在源码中有对应注释与位置约束
 */

const TOOL_PATH = 'D:/doge-code/src/tools/WebSearchTool/WebSearchTool.ts'

function readTool(): string {
  // 用 fs 直读，避免 import 该重依赖模块
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readFileSync } = require('fs')
  return readFileSync(TOOL_PATH, 'utf8')
}

describe('SubAgentManager 搜索计数', () => {
  it('默认上限 200', () => {
    const mgr = new SubAgentManager(20, 3, 200, 200)
    expect(mgr.getStats().maxSearches).toBe(200)
  })

  it('未达上限时 canSearch 为真', () => {
    const mgr = new SubAgentManager(20, 3, 2, 200)
    expect(mgr.canSearch()).toBe(true)
  })

  it('达到上限后 canSearch 为假', () => {
    const mgr = new SubAgentManager(20, 3, 2, 200)
    mgr.recordSearch()
    expect(mgr.canSearch()).toBe(true)
    mgr.recordSearch()
    expect(mgr.canSearch()).toBe(false)
  })

  it('计数只增不减', () => {
    const mgr = new SubAgentManager(20, 3, 5, 200)
    for (let i = 0; i < 5; i++) mgr.recordSearch()
    expect(mgr.getStats().searchesUsed).toBe(5)
    expect(mgr.canSearch()).toBe(false)
  })
})

describe('WebSearchTool 接入上限（源码契约）', () => {
  it('call 中确实调用了 canSearch', () => {
    expect(readTool()).toContain('searchMgr.canSearch()')
  })

  it('搜索执行后确实调用了 recordSearch', () => {
    expect(readTool()).toContain('searchMgr.recordSearch()')
  })

  it('recordSearch 位于缓存提前返回之后（缓存命中不计数）', () => {
    const src = readTool()
    const cacheReturn = src.indexOf('// 缓存处理')
    const recordCall = src.indexOf('searchMgr.recordSearch()')
    expect(cacheReturn).toBeGreaterThan(-1)
    expect(recordCall).toBeGreaterThan(cacheReturn)
  })

  it('不再保留「仅日志」的占位实现', () => {
    expect(readTool()).not.toContain('仅日志，未实现会话级计数器')
  })
})
