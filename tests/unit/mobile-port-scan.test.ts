/**
 * 移动桥接的端口选择与自动递增测试。
 *
 * 为什么必须测：这段逻辑错了的表现是「桥接起不来但看不出为什么」——
 * 而端口冲突在多窗口并发下是**常态**（每个窗口一个实例都想要 5680），
 * 所以它是每次多开都会走的路径，不是边缘情况。
 *
 * 变异验证：把 candidatePorts 的 `limit` 改成固定 1（不递增），
 * 「起始端口被占时顺延到下一个」用例失败。
 */
import { describe, it, expect } from 'vitest'
import {
  PORT_SCAN_LIMIT,
  candidatePorts,
  pickPort,
  allPortsBusyMessage,
} from '../../src/bridge/mobilePortScan.js'

describe('candidatePorts — 候选端口生成', () => {
  it('从起始端口起连续递增', () => {
    expect(candidatePorts(5680, 3)).toEqual([5680, 5681, 5682])
  })

  it('默认试 10 个（criteria：10 个都不成功才报错）', () => {
    const ports = candidatePorts(5680)
    expect(ports).toHaveLength(PORT_SCAN_LIMIT)
    expect(PORT_SCAN_LIMIT).toBe(10)
    expect(ports[0]).toBe(5680)
    expect(ports[9]).toBe(5689)
  })

  it('接近上限时不越界', () => {
    // 65535 是 TCP 上限，候选中不能出现 65536
    const ports = candidatePorts(65533, 5)
    expect(ports).toEqual([65533, 65534, 65535])
    expect(ports.every(p => p <= 65535)).toBe(true)
  })

  it('非法起始端口返回空列表', () => {
    // 非法值不该产出任何候选，否则会在奇怪端口上尝试
    expect(candidatePorts(0)).toEqual([])
    expect(candidatePorts(-1)).toEqual([])
    expect(candidatePorts(65536)).toEqual([])
    expect(candidatePorts(1.5)).toEqual([])
    expect(candidatePorts(NaN)).toEqual([])
  })
})

describe('pickPort — 依次试探', () => {
  it('起始端口可用时直接用它', () => {
    const r = pickPort(5680, () => true)
    expect(r.port).toBe(5680)
    expect(r.tried).toEqual([5680])
  })

  it('起始端口被占时顺延到下一个（关键）', () => {
    // 这是多窗口并发的核心路径：第二个实例必须自动改用 5681
    const r = pickPort(5680, p => p !== 5680)
    expect(r.port).toBe(5681)
    expect(r.tried).toEqual([5680, 5681])
  })

  it('中间有空洞时跳到下一个可用', () => {
    const busy = new Set([5680, 5681, 5682])
    const r = pickPort(5680, p => !busy.has(p))
    expect(r.port).toBe(5683)
    expect(r.tried).toEqual([5680, 5681, 5682, 5683])
  })

  it('10 个全被占时返回 null 并报告试过的端口', () => {
    const r = pickPort(5680, () => false)
    expect(r.port).toBeNull()
    expect(r.tried).toHaveLength(PORT_SCAN_LIMIT)
    expect(r.tried[0]).toBe(5680)
    expect(r.tried[9]).toBe(5689)
  })

  it('恰好第 10 个可用时能选上（边界）', () => {
    // 「10 个都不成功才报错」—— 所以第 10 个成功就必须用，不能报错
    const r = pickPort(5680, p => p === 5689)
    expect(r.port).toBe(5689)
    expect(r.tried).toHaveLength(10)
  })

  it('探测抛异常时当作不可用并继续', () => {
    // 某个端口探测失败（如权限不足）不代表后续端口也不行
    const r = pickPort(5680, p => {
      if (p === 5680) throw new Error('探测失败')
      return true
    })
    expect(r.port).toBe(5681)
  })

  it('全部探测抛异常时返回 null（不向上抛）', () => {
    // 启动路径绝不能抛：会崩掉整个 CLI
    const r = pickPort(5680, () => {
      throw new Error('boom')
    })
    expect(r.port).toBeNull()
  })
})

describe('allPortsBusyMessage — 全满时的提示', () => {
  it('给出试过的端口范围而非单个端口', () => {
    const msg = allPortsBusyMessage(5680, [5680, 5681, 5682])
    expect(msg).toContain('5680-5682')
  })

  it('说明多窗口是常见原因（避免误判为程序坏了）', () => {
    const msg = allPortsBusyMessage(5680, [5680, 5681])
    expect(msg).toContain('多')
    expect(msg).toContain('窗口')
  })

  it('给出可执行的下一步', () => {
    const msg = allPortsBusyMessage(5680, [5680, 5681])
    expect(msg).toContain('netstat')
    expect(msg).toContain('CLAUDE_CODE_MOBILE_PORT')
  })

  it('只有一个端口时也能给出可读文案', () => {
    const msg = allPortsBusyMessage(5680, [5680])
    expect(msg).toContain('5680')
    expect(msg).not.toContain('5680-5680')
  })

  it('sawReserved 时提示系统保留端口，而非误导用户去 netstat 找进程', () => {
    // 真实场景：Windows 上 5681-5880 被 Hyper-V/WSL 保留，绑定报 EACCES。
    // 若仍套用「被占用 → netstat -ano 查进程」的文案，用户会发现查不到任何进程。
    const msg = allPortsBusyMessage(5680, [5680, 5681, 5682], true)
    expect(msg, '应说明是系统保留').toContain('保留')
    expect(msg, '应给出查保留区间的命令').toContain('excludedportrange')
    // 关键词是「netstat -ano」这条查进程的具体命令 —— 保留端口场景下它查不到东西
    expect(msg, '不应把 netstat -ano 当作建议命令').not.toContain('netstat -ano')
    // 仍需给出逃生出口
    expect(msg).toContain('CLAUDE_CODE_MOBILE_PORT')
  })

  it('未出现 EACCES 时仍沿用「被占用」文案', () => {
    const msg = allPortsBusyMessage(5680, [5680, 5681], false)
    expect(msg).toContain('被占用')
    expect(msg).not.toContain('excludedportrange')
  })
})
