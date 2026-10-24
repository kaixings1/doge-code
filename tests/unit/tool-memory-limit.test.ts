import { describe, it, expect } from 'vitest'
import {
  buildMemoryLimitedSpawn,
  parseMemoryLimitBytes,
} from '../../src/utils/shell/memoryLimit.js'

/**
 * CLAUDE_CODE_TOOL_MEMORY_LIMIT（对齐官方 v2.1.233）
 *
 * 环境限制：本机是 Windows，无法真正创建 cgroup。因此这里测的是
 * **能在当前平台验证的全部逻辑**——参数解析、启动参数构造、平台门控。
 * 真正生效路径（systemd-run 起 scope）需在 Linux 上验证，已在 TASK.md 标注。
 */

describe('parseMemoryLimitBytes', () => {
  it('未设置 / 空串 → 关闭', () => {
    expect(parseMemoryLimitBytes(undefined)).toBe(null)
    expect(parseMemoryLimitBytes('')).toBe(null)
    expect(parseMemoryLimitBytes('   ')).toBe(null)
  })

  it('纯字节数', () => {
    expect(parseMemoryLimitBytes('1073741824')?.bytes).toBe(1073741824)
  })

  it('带单位 K / M / G / T（大小写不敏感，可带 B 后缀）', () => {
    expect(parseMemoryLimitBytes('512K')?.bytes).toBe(512 * 1024)
    expect(parseMemoryLimitBytes('512m')?.bytes).toBe(512 * 1024 ** 2)
    expect(parseMemoryLimitBytes('2G')?.bytes).toBe(2 * 1024 ** 3)
    expect(parseMemoryLimitBytes('1gB')?.bytes).toBe(1024 ** 3)
    expect(parseMemoryLimitBytes('1T')?.bytes).toBe(1024 ** 4)
  })

  it('小数单位', () => {
    expect(parseMemoryLimitBytes('1.5G')?.bytes).toBe(Math.floor(1.5 * 1024 ** 3))
  })

  it('非法值一律关闭（不静默套用用户没要求的限制）', () => {
    for (const bad of ['abc', '0', '-1', '1X', '1i', 'G', '1G2M']) {
      expect(parseMemoryLimitBytes(bad), 'value=' + bad).toBe(null)
    }
  })

  it('保留原始值便于日志展示', () => {
    expect(parseMemoryLimitBytes('2G')?.raw).toBe('2G')
  })
})

describe('buildMemoryLimitedSpawn', () => {
  const plan = parseMemoryLimitBytes('2G')!

  it('非 Linux 平台不包装（Windows/macOS 保持原行为）', () => {
    expect(buildMemoryLimitedSpawn(plan, 'bash', ['-c', 'ls'], 'win32', true)).toBe(null)
    expect(buildMemoryLimitedSpawn(plan, 'bash', ['-c', 'ls'], 'darwin', true)).toBe(null)
  })

  it('Linux 但无 systemd-run 时不包装（不阻断命令）', () => {
    expect(buildMemoryLimitedSpawn(plan, 'bash', ['-c', 'ls'], 'linux', false)).toBe(null)
  })

  it('无限制计划时不包装', () => {
    expect(buildMemoryLimitedSpawn(null, 'bash', ['-c', 'ls'], 'linux', true)).toBe(null)
  })

  it('Linux + systemd-run → 包一层 scope 并带 MemoryMax', () => {
    const r = buildMemoryLimitedSpawn(plan, 'bash', ['-c', 'npm run build'], 'linux', true)
    expect(r).toBeTruthy()
    expect(r!.bin).toBe('systemd-run')
    expect(r!.args).toContain('--scope')
    expect(r!.args).toContain('--collect')
    expect(r!.args).toContain(`--property=MemoryMax=${plan.bytes}`)
    // 原命令必须原样跟在 -- 之后，参数不能被改写
    const sep = r!.args.indexOf('--')
    expect(sep).toBeGreaterThan(-1)
    expect(r!.args.slice(sep + 1)).toEqual(['bash', '-c', 'npm run build'])
  })
})
