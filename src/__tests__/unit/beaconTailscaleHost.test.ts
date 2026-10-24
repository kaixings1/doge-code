import { describe, expect, it } from 'vitest'
import {
  BEACON_VERSION,
  buildBeaconPayload,
  parseBeacon,
  serializeBeacon,
} from '../../bridge/mobileBeacon.js'

/**
 * 报文携带 Tailscale 地址（tailscaleHost）。
 *
 * 背景：组播只在同一二层网段内传播，穿不过 Tailscale 的三层覆盖网。
 * 所以 Tailscale 路径不靠广播打通，而是**搭车**：手机在局域网收到广播时
 * 顺带拿到 `100.x` 地址，出门切流量后直接用（模式 3）。
 *
 * 关键约束（写错会让所有旧客户端失效）：
 * - 该字段必须**可选**，缺席时不产生空串
 * - 加了字段**不能**升协议版本：旧客户端按版本号严格比对，
 *   升版本会让它们丢弃整条广播，连局域网发现都一起坏掉
 */

const base = {
  sessionId: 's1',
  port: 6000,
  cwd: 'D:/proj',
  label: 'doge-code',
  interactive: true,
  clients: 0,
  now: 1_700_000_000_000,
}

describe('beacon 携带 Tailscale 地址', () => {
  it('有 Tailscale 地址时写入字段', () => {
    const p = buildBeaconPayload({ ...base, tailscaleHost: '100.99.118.124' })
    expect(p.tailscaleHost).toBe('100.99.118.124')
  })

  it('无 Tailscale 地址时省略字段（不发空串）', () => {
    const p = buildBeaconPayload({ ...base, tailscaleHost: null })
    expect('tailscaleHost' in p).toBe(false)
  })

  it('序列化→解析往返保留 Tailscale 地址', () => {
    const buf = serializeBeacon(
      buildBeaconPayload({ ...base, tailscaleHost: '100.99.118.124' }),
    )
    expect(buf).not.toBeNull()
    const parsed = parseBeacon(buf as Buffer)
    expect(parsed?.tailscaleHost).toBe('100.99.118.124')
  })

  it('旧报文（无该字段）解析后不出现该键', () => {
    const legacy = Buffer.from(
      JSON.stringify({
        beacon: 'doge-mobile',
        v: BEACON_VERSION,
        sessionId: 'old',
        port: 5680,
        cwd: '',
        label: 'old',
        interactive: true,
        clients: 0,
        ts: 1,
      }),
    )
    const parsed = parseBeacon(legacy)
    expect(parsed).not.toBeNull()
    expect('tailscaleHost' in (parsed as object)).toBe(false)
  })

  it('加入该字段不改变协议版本', () => {
    const p = buildBeaconPayload({ ...base, tailscaleHost: '100.64.0.9' })
    expect(p.v).toBe(BEACON_VERSION)
  })

  it('与 tunnelUrl 可共存（两种外出入口同时存在）', () => {
    const p = buildBeaconPayload({
      ...base,
      tunnelUrl: 'wss://x.trycloudflare.com/mobile/ws',
      tailscaleHost: '100.99.118.124',
    })
    expect(p.tunnelUrl).toContain('trycloudflare')
    expect(p.tailscaleHost).toBe('100.99.118.124')
  })

  it('空串 Tailscale 地址视为未设置', () => {
    const p = buildBeaconPayload({ ...base, tailscaleHost: '' })
    expect('tailscaleHost' in p).toBe(false)
  })
})
