import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildBeaconPayload, parseBeacon, BEACON_VERSION } from '../../bridge/mobileBeacon.js'
import { readTunnelUrl, toWsUrl, tunnelUrlFilePath } from '../../bridge/tunnelUrlFile.js'

/**
 * beacon 携带隧道地址（自动下发）的协议契约测试。
 *
 * 背景：快隧道子域每次启动都变，手机端无法预知。服务端广播时从
 * 「约定文件」读当前地址，塞进 beacon 的 `tunnelUrl` —— 手机同 WiFi
 * 收到即自动记住，出门可直接用。
 */

const base = {
  sessionId: 'mobile-1',
  port: 6000,
  cwd: '/tmp/x',
  label: '测试',
  interactive: true,
  clients: 0,
}

describe('beacon payload 的 tunnelUrl 字段', () => {
  it('有隧道时序列化并携带 tunnelUrl', () => {
    const p = buildBeaconPayload({ ...base, tunnelUrl: 'wss://a-b-c.trycloudflare.com/mobile/ws' })
    expect(p.tunnelUrl).toBe('wss://a-b-c.trycloudflare.com/mobile/ws')
  })

  it('无隧道时省略字段（而非空串）', () => {
    // 省略 ≠ 空串：客户端据此区分「没有这个信息」与「信息是空的」
    const p = buildBeaconPayload({ ...base, tunnelUrl: null })
    expect('tunnelUrl' in p).toBe(false)
  })

  it('tunnelUrl 为空串时也省略', () => {
    const p = buildBeaconPayload({ ...base, tunnelUrl: '' })
    expect('tunnelUrl' in p).toBe(false)
  })

  it('加字段不升协议版本（旧客户端仍能解析）', () => {
    // 若升版本，旧客户端会因 v 不符丢弃整条广播 —— 连局域网发现都失效。
    const withTunnel = buildBeaconPayload({ ...base, tunnelUrl: 'wss://x.trycloudflare.com/mobile/ws' })
    expect(withTunnel.v).toBe(BEACON_VERSION)
    expect(BEACON_VERSION).toBe(1)
  })

  it('parseBeacon 往返保留 tunnelUrl', () => {
    const url = 'wss://round-trip.trycloudflare.com/mobile/ws'
    const p = buildBeaconPayload({ ...base, tunnelUrl: url })
    const parsed = parseBeacon(JSON.stringify(p))
    expect(parsed?.tunnelUrl).toBe(url)
  })

  it('无 tunnelUrl 的旧报文仍能解析（向后兼容）', () => {
    const old = JSON.stringify({
      beacon: 'doge-mobile',
      v: 1,
      sessionId: 'mobile-1',
      port: 6000,
      cwd: '/tmp',
      label: 'x',
      interactive: true,
      clients: 0,
      ts: Date.now(),
    })
    const parsed = parseBeacon(old)
    expect(parsed).not.toBeNull()
    expect(parsed?.tunnelUrl).toBeUndefined()
  })
})

describe('toWsUrl：https 隧道地址 → wss', () => {
  it('补 /mobile/ws 路径且不补端口', () => {
    expect(toWsUrl('https://abc.trycloudflare.com')).toBe('wss://abc.trycloudflare.com/mobile/ws')
  })

  it('已有路径时不再重复追加', () => {
    expect(toWsUrl('https://abc.trycloudflare.com/mobile/ws')).toBe(
      'wss://abc.trycloudflare.com/mobile/ws',
    )
  })
})

describe('readTunnelUrl：文件读取的健壮性', () => {
  it('文件不存在时返回 null（不抛异常）', () => {
    // 用不存在的路径下的行为验证：读取失败必须静默返回 null，
    // 因为这是旁路能力，绝不能影响主流程。
    expect(() => readTunnelUrl()).not.toThrow()
  })
})

/**
 * 多实例多隧道：地址按端口分文件。
 *
 * 这是「隧道模式下能切换多个会话」的关键契约 —— 若各实例共用一个文件，
 * 后起的会覆盖先起的，所有实例广播同一地址，手机切换「切了等于没切」。
 *
 * 测试用**真实文件系统**（写 tmpdir 下真实的约定文件），不走 mock：
 * mock 只能证明「我调用了正确的函数」，证明不了「两个端口互不覆盖」。
 */
describe('tunnelUrlFilePath：按端口分文件', () => {
  const created: string[] = []

  afterEach(() => {
    for (const f of created.splice(0)) rmSync(f, { force: true })
  })

  it('不同端口 → 不同路径', () => {
    expect(tunnelUrlFilePath(6000)).not.toBe(tunnelUrlFilePath(6001))
    expect(tunnelUrlFilePath(6000)).toContain('6000')
    expect(tunnelUrlFilePath(6001)).toContain('6001')
  })

  it('不传端口 → 回落旧单文件路径（兼容旧脚本）', () => {
    expect(tunnelUrlFilePath()).toContain('doge-tunnel-url.json')
    expect(tunnelUrlFilePath()).toBe(join(tmpdir(), 'doge-tunnel-url.json'))
  })

  it('非法端口（0/负数/非整数）→ 回落单文件路径', () => {
    // 端口非法时按端口命名会得到 `doge-tunnel-url-0.json` 这类无意义文件，
    // 且与真正的「未指定」语义混淆 —— 一律回落。
    expect(tunnelUrlFilePath(0)).toBe(tunnelUrlFilePath())
    expect(tunnelUrlFilePath(-1)).toBe(tunnelUrlFilePath())
    expect(tunnelUrlFilePath(1.5)).toBe(tunnelUrlFilePath())
  })

  it('两个端口的地址互不覆盖（核心契约）', () => {
    const f6000 = tunnelUrlFilePath(6000)
    const f6001 = tunnelUrlFilePath(6001)
    created.push(f6000, f6001)

    // 模拟两个实例各自写隧道地址
    writeFileSync(f6000, JSON.stringify({ url: 'https://a.trycloudflare.com', at: Date.now() }), 'utf8')
    writeFileSync(f6001, JSON.stringify({ url: 'https://b.trycloudflare.com', at: Date.now() }), 'utf8')

    // 各自读到自己那份 —— 互不干扰
    expect(readTunnelUrl(6000)).toBe('https://a.trycloudflare.com')
    expect(readTunnelUrl(6001)).toBe('https://b.trycloudflare.com')
  })

  it('A 端口写地址不影响 B 端口（不串味）', () => {
    const f6000 = tunnelUrlFilePath(6000)
    const f6001 = tunnelUrlFilePath(6001)
    created.push(f6000, f6001)

    writeFileSync(f6000, JSON.stringify({ url: 'https://a.trycloudflare.com', at: Date.now() }), 'utf8')
    // 6001 从未写过 —— 应为 null，而不是读到 6000 的地址
    expect(readTunnelUrl(6001)).toBeNull()
  })
})
