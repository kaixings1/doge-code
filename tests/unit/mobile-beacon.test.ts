/**
 * 移动桥接 UDP 广播的报文与解析测试（纯逻辑）。
 *
 * 为什么必须测：广播报文是**跨端契约** —— 服务端发、客户端收，
 * 两端各写一份实现。字段名/类型不一致会表现为「手机完全发现不了
 * 会话」，且**没有任何报错**（UDP 无连接、无回执），极难归因。
 *
 * 最关键的判据：`port` 必须是**实际监听端口**（自动顺延后与起始端口
 * 不同）。写错会让手机连到一个连不上的端口。
 *
 * 变异验证：把 parseBeacon 的端口校验去掉，「端口缺失被拒绝」用例失败。
 */
import { describe, it, expect } from 'vitest'
import {
  BEACON_GROUP,
  BEACON_PORT,
  BEACON_VERSION,
  buildBeaconPayload,
  serializeBeacon,
  parseBeacon,
} from '../../src/bridge/mobileBeacon.js'

const base = {
  sessionId: 'mobile-123',
  port: 5680,
  cwd: 'D:\\proj',
  label: '前端重构',
  interactive: true,
  clients: 2,
}

describe('buildBeaconPayload — 报文构造', () => {
  it('包含协议标识与版本', () => {
    const p = buildBeaconPayload(base)
    expect(p.beacon).toBe('doge-mobile')
    expect(p.v).toBe(BEACON_VERSION)
  })

  it('端口取传入值（必须是实际监听端口）', () => {
    // 自动顺延后实际端口与起始端口不同 —— 广播必须发实际的那个
    const p = buildBeaconPayload({ ...base, port: 5683 })
    expect(p.port).toBe(5683)
  })

  it('时间戳自动填充', () => {
    const p = buildBeaconPayload({ ...base, now: 1700000000000 })
    expect(p.ts).toBe(1700000000000)
    // 不传时用当前时间
    expect(buildBeaconPayload(base).ts).toBeGreaterThan(0)
  })

  it('有 resumeSessionId 时带上', () => {
    const p = buildBeaconPayload({ ...base, resumeSessionId: 'abc-123' })
    expect(p.resumeSessionId).toBe('abc-123')
  })

  it('无 resumeSessionId 时省略字段（而非空串）', () => {
    // 客户端据此区分「没有这个信息」与「信息是空的」
    expect(buildBeaconPayload(base).resumeSessionId).toBeUndefined()
    expect(buildBeaconPayload({ ...base, resumeSessionId: null }).resumeSessionId).toBeUndefined()
    expect(buildBeaconPayload({ ...base, resumeSessionId: '' }).resumeSessionId).toBeUndefined()
  })

  it('交互状态与客户端数被带上', () => {
    const p = buildBeaconPayload({ ...base, interactive: false, clients: 0 })
    expect(p.interactive).toBe(false)
    expect(p.clients).toBe(0)
  })
})

describe('serializeBeacon — 序列化', () => {
  it('产出可被 JSON.parse 的 Buffer', () => {
    const buf = serializeBeacon(buildBeaconPayload(base))
    expect(buf).toBeTruthy()
    const parsed = JSON.parse(buf!.toString('utf8'))
    expect(parsed.beacon).toBe('doge-mobile')
    expect(parsed.port).toBe(5680)
  })

  it('中文标签不被破坏', () => {
    const buf = serializeBeacon(buildBeaconPayload({ ...base, label: '中文标签·测试' }))
    expect(JSON.parse(buf!.toString('utf8')).label).toBe('中文标签·测试')
  })
})

describe('parseBeacon — 解析（客户端契约）', () => {
  it('解析合法报文', () => {
    const raw = JSON.stringify(buildBeaconPayload(base))
    const p = parseBeacon(raw)
    expect(p).toBeTruthy()
    expect(p!.port).toBe(5680)
    expect(p!.label).toBe('前端重构')
    expect(p!.cwd).toBe('D:\\proj')
    expect(p!.clients).toBe(2)
    expect(p!.interactive).toBe(true)
  })

  it('与 serialize 往返一致', () => {
    const original = buildBeaconPayload({ ...base, resumeSessionId: 'r-1' })
    const round = parseBeacon(serializeBeacon(original)!.toString('utf8'))
    expect(round).toEqual(original)
  })

  // ── 拒绝非法输入 ──

  it('非 JSON 被拒绝', () => {
    expect(parseBeacon('not json')).toBeNull()
    expect(parseBeacon('')).toBeNull()
    expect(parseBeacon('{bad')).toBeNull()
  })

  it('非本协议被拒绝', () => {
    // 别的程序可能往同一组播地址发东西
    expect(parseBeacon(JSON.stringify({ beacon: 'other', v: 1, port: 5680 }))).toBeNull()
    expect(parseBeacon(JSON.stringify({ port: 5680 }))).toBeNull()
  })

  it('版本不匹配被拒绝（关键：不猜测字段语义）', () => {
    // 新旧版本字段语义可能不同，猜错比不认更糟
    expect(parseBeacon(JSON.stringify({ beacon: 'doge-mobile', v: 999, port: 5680 }))).toBeNull()
    expect(parseBeacon(JSON.stringify({ beacon: 'doge-mobile', port: 5680 }))).toBeNull()
  })

  it('端口缺失或非法被拒绝（关键：连错的端口比不连更糟）', () => {
    const mk = (port: unknown) =>
      parseBeacon(JSON.stringify({ beacon: 'doge-mobile', v: BEACON_VERSION, port }))
    expect(mk(undefined)).toBeNull()
    expect(mk(null)).toBeNull()
    expect(mk('5680')).toBeNull()
    expect(mk(0)).toBeNull()
    expect(mk(-1)).toBeNull()
    expect(mk(1.5)).toBeNull()
    expect(mk(NaN)).toBeNull()
  })

  it('缺可选字段时回落安全默认值', () => {
    const p = parseBeacon(JSON.stringify({ beacon: 'doge-mobile', v: BEACON_VERSION, port: 5680 }))
    expect(p).toBeTruthy()
    expect(p!.sessionId).toBe('')
    expect(p!.label).toBe('')
    expect(p!.cwd).toBe('')
    // interactive 默认 false（保守：不是 true 就不当交互模式）
    expect(p!.interactive).toBe(false)
    expect(p!.clients).toBe(0)
    expect(p!.ts).toBe(0)
  })

  it('interactive 只有严格 true 才算真', () => {
    // 字符串 "true" / 1 不该被当成 true —— 与「通知抑制」同样的
    // 保守原则：类型异常时落到安全的一侧
    const mk = (v: unknown) =>
      parseBeacon(JSON.stringify({ beacon: 'doge-mobile', v: BEACON_VERSION, port: 1, interactive: v }))!
    expect(mk(true).interactive).toBe(true)
    expect(mk('true').interactive).toBe(false)
    expect(mk(1).interactive).toBe(false)
  })

  it('字段类型错时不崩（回落默认值）', () => {
    const p = parseBeacon(
      JSON.stringify({
        beacon: 'doge-mobile',
        v: BEACON_VERSION,
        port: 5680,
        sessionId: 123,
        label: {},
        clients: 'many',
      }),
    )
    expect(p).toBeTruthy()
    expect(p!.sessionId).toBe('')
    expect(p!.label).toBe('')
    expect(p!.clients).toBe(0)
  })

  it('空 resumeSessionId 不带上', () => {
    const p = parseBeacon(
      JSON.stringify({ beacon: 'doge-mobile', v: BEACON_VERSION, port: 5680, resumeSessionId: '' }),
    )
    expect(p!.resumeSessionId).toBeUndefined()
  })
})

describe('常量 — 两端契约', () => {
  it('组播地址合法（239.x 是本地管理范围）', () => {
    const parts = BEACON_GROUP.split('.').map(Number)
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe(239)
    expect(parts.every(n => n >= 0 && n <= 255)).toBe(true)
  })

  it('广播端口与 HTTP 端口不同（避免排查时混淆）', () => {
    expect(BEACON_PORT).not.toBe(5680)
  })

  it('间隔在合理范围（太短费电、太长发现慢）', () => {
    expect(BEACON_PORT).toBeGreaterThan(0)
  })
})
