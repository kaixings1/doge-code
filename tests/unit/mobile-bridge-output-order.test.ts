/**
 * start-mobile-bridge.mjs 输出顺序回归。
 *
 * 背景（用户反馈「这个显示的位置不太好」）：
 * 就绪轮询曾是 `void probe()` fire-and-forget，脚本不 await 就继续打印
 * 隧道/地址等后续日志。于是 20 秒超时的「[未就绪]」会在**任意位置**冒出，
 * 夹在无关日志中间 —— 读者无法把它与前文的地址块对上。
 *
 * 修复要求（本测试固化）：
 * 1. 就绪轮询必须 await（不得再用 void/fire-and-forget）
 * 2. child('exit') 监听必须注册在轮询**之前**，否则轮询阻塞期间
 *    doge.exe 崩溃会被漏掉
 * 3. 「[未就绪]」文案必须紧邻就绪判断，且带端口号
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = readFileSync(
  join(here, '..', '..', 'scripts', 'start-mobile-bridge.mjs'),
  'utf8',
)

describe('start-mobile-bridge 输出顺序', () => {
  it('就绪轮询必须在顶层 await，不得被 void/IIFE 包裹成 fire-and-forget', () => {
    // 只看真正的代码行，跳过注释（注释里会提到「曾经是 void probe()」）
    const codeLines = SRC.split('\n').filter(l => !l.trim().startsWith('//'))
    const code = codeLines.join('\n')
    // 取 phoneUrl 轮询块
    const start = code.indexOf('if (phoneUrl)')
    expect(start).toBeGreaterThan(-1)
    const block = code.slice(start, code.indexOf('// ====', start))
    // 块内不得出现 void( / void ( —— 那是把轮询变 fire-and-forget 的形态
    expect(block, '轮询块内出现 void( 说明又被 fire-and-forget 了').not.toMatch(/\bvoid\s*\(/)
    // 必须是顶层 while + await（而不是包进 async IIFE）
    expect(block).toMatch(/while\s*\(Date\.now\(\)\s*<\s*deadline\)\s*\{[\s\S]*?await\s+probeOnce\(\)/)
  })

  it('child exit 监听注册在就绪轮询之前', () => {
    const exitIdx = SRC.indexOf("child?.on('exit'")
    const probeIdx = SRC.indexOf('await probeOnce()')
    expect(exitIdx).toBeGreaterThan(-1)
    expect(probeIdx).toBeGreaterThan(-1)
    expect(exitIdx).toBeLessThan(probeIdx)
  })

  it('未就绪提示紧邻就绪判断且带端口号', () => {
    expect(SRC).toMatch(/\[就绪\][\s\S]{0,400}?\[未就绪\]/)
    expect(SRC).toMatch(/\[未就绪\][^\n]*端口\s*['"]?\s*\+?\s*PORT/)
  })
})
