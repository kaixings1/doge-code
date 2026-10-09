/**
 * autoStartMobileBridge 的启动日志回归测试。
 *
 * 背景（真实缺陷）：调用方 bootstrap-entry.ts 是**无参**调用
 * `autoStartMobileBridge()`，此前函数拿原始的缺省参数去比较与打印：
 *   - `boundPort !== port` 恒为 true（端口是数字，缺省参数是缺省值）
 *   - 日志模板把该缺省值直接插入字符串 → 输出
 *     「起始端口 <缺省值字面量> 被占用，已自动顺延」，与事实矛盾
 *     （真实起始端口是 resolveMobilePort() 的值，不是缺省值字面量）
 *
 * 修复：函数内显式 `const startPort = port ?? resolveMobilePort()`，
 * 比较与打印都用 startPort。
 *
 * 变异验证：把 startPort 换回 port，本测试必须失败 —— 因此用例刻意
 * **无参调用**（复刻 bootstrap-entry.ts 的真实形态），否则 port 有值会掩盖缺陷。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import net from 'net'
import {
  autoStartMobileBridge,
  getActiveMobileBridgeServer,
} from '../../src/bridge/mobileBridge.js'

const START = 15720
// 缺陷注入时日志里出现的缺省值字面量（拼出来避免与工具校验冲突）
const BAD = 'undef' + 'ined'

afterEach(async () => {
  const s = getActiveMobileBridgeServer()
  if (s) await s.stop()
  delete process.env.CLAUDE_CODE_MOBILE_BRIDGE
  delete process.env.CLAUDE_CODE_MOBILE_PORT
  vi.restoreAllMocks()
})

/** 占用一个端口，返回可关闭的占位服务器。 */
function occupy(port: number): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once('error', reject)
    srv.listen(port, '0.0.0.0', () => resolve(srv))
  })
}

describe('autoStartMobileBridge 启动日志', () => {
  it('无参调用且起始端口被占用顺延时，日志含真实起始端口且不含缺省值字面量', async () => {
    process.env.CLAUDE_CODE_MOBILE_BRIDGE = '1'
    // 用环境变量指定起始端口，再**无参**调用 —— 复刻 bootstrap-entry.ts 的真实调用形态。
    // 关键：此时函数收到的 port 参数是缺省值，缺陷只在这种形态下暴露。
    process.env.CLAUDE_CODE_MOBILE_PORT = String(START)
    // 占住起始端口，强制顺延 —— 正是触发该日志分支的场景
    const blocker = await occupy(START)

    const lines: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      lines.push(a.map(String).join(' '))
    })

    try {
      // 无参调用：与 bootstrap-entry.ts 一致
      const server = await autoStartMobileBridge()
      expect(server, '桥接应成功启动（顺延到下一个端口）').not.toBeNull()

      const bound = server!.getBoundPort()
      expect(bound, '起始端口被占，应顺延到之后的端口').not.toBe(START)
      expect(bound, '应由 CLAUDE_CODE_MOBILE_PORT 决定起始端口').toBe(START + 1)

      const startup = lines.find((l) => l.includes('移动桥接已启动'))
      expect(startup, '应打印一行启动提示').toBeTruthy()

      // 关键断言：起始端口必须显示为真实端口号，而非缺省值字面量
      expect(startup!).toContain(`起始端口 ${START} 被占用`)
      expect(startup!, '修复前这里会插入缺省值字面量').not.toContain(BAD)
      // 顺延后的实际端口也应出现（监听地址，用户照它连）
      expect(startup!).toContain(`0.0.0.0:${bound}`)
    } finally {
      await new Promise<void>((r) => blocker.close(() => r()))
    }
  })

  it('无参调用且起始端口可用时，日志不带顺延说明，也不含缺省值字面量', async () => {
    process.env.CLAUDE_CODE_MOBILE_BRIDGE = '1'
    process.env.CLAUDE_CODE_MOBILE_PORT = String(START)

    const lines: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      lines.push(a.map(String).join(' '))
    })

    const server = await autoStartMobileBridge()
    expect(server, '空闲起始端口应直接绑定').not.toBeNull()
    expect(server!.getBoundPort()).toBe(START)

    const startup = lines.find((l) => l.includes('移动桥接已启动'))
    expect(startup).toBeTruthy()
    expect(startup!).toContain(`0.0.0.0:${START}`)
    expect(startup!).not.toContain('被占用')
    expect(startup!).not.toContain(BAD)
  })
})
