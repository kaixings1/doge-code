/**
 * 终端面板高度计算与可见行切片
 *
 * 测试对象：src/components/TerminalPanel/TerminalPanelView.tsx 导出的
 * computePanelHeight / sliceVisibleLines。
 *
 * 为什么值得测：原实现硬编码 height=20（24 行终端里几乎占满整屏），
 * 改为自适应后引入两个隐蔽的失败模式 ——
 *   1. 极小终端下"最小高度"盖过物理高度 → 溢出撑破屏幕
 *   2. outputRows 为 0 时 `slice(-0)` 等价 `slice(0)` → 返回全部行
 * 两者都不报错，只在特定终端尺寸下显现。故在此锁住边界。
 */

import { describe, expect, it } from 'vitest'
import {
  buildFollowCommand,
  computePanelHeight,
  sliceVisibleLines,
} from '../../src/components/TerminalPanel/TerminalPanelView.js'

describe('computePanelHeight', () => {
  it('24 行终端（最常见）→ 占 60%，不再是原来的写死 20', () => {
    // floor(24 * 0.6) = 14；min(14, 20, 24) = 14
    expect(computePanelHeight(24)).toBe(14)
  })

  it('永不溢出：任何终端高度下面板都 <= 终端高度', () => {
    for (let rows = 0; rows <= 300; rows++) {
      expect(computePanelHeight(rows)).toBeLessThanOrEqual(rows)
    }
  })

  it('永不返回负值（rows<=4 时 rows-4 为负，Ink 收到负 height 行为未定义）', () => {
    for (let rows = 0; rows <= 10; rows++) {
      expect(computePanelHeight(rows)).toBeGreaterThanOrEqual(0)
    }
    expect(computePanelHeight(0)).toBe(0)
    expect(computePanelHeight(3)).toBe(0)
    expect(computePanelHeight(4)).toBe(0)
  })

  it('大终端不无节制地长（受 MAX_HEIGHT=24 约束）', () => {
    expect(computePanelHeight(200)).toBe(24)
    expect(computePanelHeight(100)).toBe(24)
    // 40 行时 floor(24)=24，min(24, 36, 24)=24
    expect(computePanelHeight(40)).toBe(24)
  })

  it('显式传入 height 时直接采用（调用方自负其责，但仍 clamp 到 >=0）', () => {
    expect(computePanelHeight(24, 10)).toBe(10)
    expect(computePanelHeight(24, 50)).toBe(50) // 显式指定不裁剪
    expect(computePanelHeight(24, -5)).toBe(0) // 负数仍被 clamp
  })

  it('典型尺寸单调不减（越大终端给越多行，直到绝对上限）', () => {
    const sizes = [10, 20, 24, 30, 40, 60, 100]
    const heights = sizes.map(r => computePanelHeight(r))
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBeGreaterThanOrEqual(heights[i - 1])
    }
  })
})

describe('sliceVisibleLines', () => {
  const lines = Array.from({ length: 500 }, (_, i) => `line-${i}`)

  it('取末尾 N 行（N = 高度 - 3，扣掉标题与边框）', () => {
    const out = sliceVisibleLines(lines, 14)
    expect(out).toHaveLength(11)
    expect(out.at(-1)).toBe('line-499')
    expect(out[0]).toBe('line-489')
  })

  it('outputRows 为 0 时返回空数组 —— 而不是 slice(-0) 的全部行（JS 负数零陷阱）', () => {
    expect(sliceVisibleLines(lines, 3)).toEqual([])
    expect(sliceVisibleLines(lines, 0)).toEqual([])
    expect(sliceVisibleLines(lines, 1)).toEqual([])
    expect(sliceVisibleLines(lines, 2)).toEqual([])
  })

  it('负数高度不抛异常，返回空数组', () => {
    expect(sliceVisibleLines(lines, -5)).toEqual([])
  })

  it('行数少于可显示行数时返回全部，不报错', () => {
    const few = ['a', 'b']
    expect(sliceVisibleLines(few, 14)).toEqual(['a', 'b'])
  })

  it('小终端只显示 1 行输出（高度 4 → 4-3=1）', () => {
    expect(sliceVisibleLines(lines, 4)).toEqual(['line-499'])
  })
})

describe('buildFollowCommand', () => {
  it('未设置路径时返回 null —— 面板维持原有交互 shell 行为', () => {
    expect(buildFollowCommand(null)).toBeNull()
    expect(buildFollowCommand('')).toBeNull()
    expect(buildFollowCommand('   ')).toBeNull()
  })

  it('Windows 用 PowerShell Get-Content -Wait 跟随（系统自带，无新依赖）', () => {
    const cmd = buildFollowCommand('D:\\logs\\app.log', 'win32')
    expect(cmd).toEqual([
      'powershell',
      '-NoProfile',
      '-Command',
      "Get-Content -LiteralPath 'D:\\logs\\app.log' -Wait -Tail 50",
    ])
  })

  it('非 Windows 用 tail -f', () => {
    expect(buildFollowCommand('/var/log/app.log', 'linux')).toEqual([
      'tail',
      '-n',
      '50',
      '-f',
      '/var/log/app.log',
    ])
  })

  it('路径两端空白被裁剪后再嵌入命令', () => {
    const cmd = buildFollowCommand('  D:\\a.log  ', 'win32')
    expect(cmd?.at(-1)).toContain("'D:\\a.log'")
  })

  it('路径含单引号时被转义为两个单引号，无法逃逸 PowerShell 字符串', () => {
    const cmd = buildFollowCommand("D:\\a'b.log", 'win32')
    expect(cmd?.at(-1)).toContain("'D:\\a''b.log'")
  })

  it('恶意路径无法构造出额外的 PowerShell 语句', () => {
    const evil = "D:\\a.log'; Remove-Item C:\\ -Recurse; #"
    const script = buildFollowCommand(evil, 'win32')!.at(-1)!
    // 关键：原本用于闭合字符串的单引号已被转义，无法逃出字符串
    expect(script).not.toContain("log'; Remove-Item")
    expect(script).toContain("log''; Remove-Item")
  })
})
