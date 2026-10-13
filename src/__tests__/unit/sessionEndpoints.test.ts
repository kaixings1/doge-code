import { describe, expect, it, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { sessionEndpoints } from '../../bridge/mobileBridge.js'
import { tunnelUrlFilePath } from '../../bridge/tunnelUrlFile.js'

/**
 * 连接时下发给手机的「本会话可用地址」契约测试。
 *
 * 背景：手机连接成功后此前拿不到任何 URL，多会话发现只能靠自己扫端口段
 * 或收 UDP 广播（仅同 WiFi 有效）。sessionEndpoints 把本机所有候选 LAN
 * 地址 + 隧道地址 + 会话标识一次性组装好，手机据此直接列出本会话。
 *
 * 这些是手机端「列本会话、切会话」的数据来源，字段缺失/串味都表现为
 * 「手机上看不到这个会话」，不会抛异常 —— 只能靠单测锁定。
 */

const created: string[] = []

afterEach(() => {
  for (const f of created.splice(0)) rmSync(f, { force: true })
})

describe('sessionEndpoints：组装本会话可用地址', () => {
  it('返回会话标识字段（多会话靠它区分）', () => {
    const ep = sessionEndpoints(6000, 'mobile-123')
    expect(ep.sessionId).toBe('mobile-123')
    expect(ep.port).toBe(6000)
    expect(typeof ep.cwd).toBe('string')
    expect(ep.cwd.length).toBeGreaterThan(0)
    expect(typeof ep.label).toBe('string')
  })

  it('lan 是 http://IP:port 形式的地址数组', () => {
    const ep = sessionEndpoints(6007, 'mobile-x')
    expect(Array.isArray(ep.lan)).toBe(true)
    // 关键：本机必有至少一张非虚拟网卡的 IPv4（否则整个下发就是空壳）。
    // 没有这条断言时，空数组会让下面的 for 循环空转、用例恒真 ——
    // 把实现改成 `lan: []` 也测不出来（变异测试实测过）。
    expect(ep.lan.length).toBeGreaterThan(0)
    // 每项必须是 http:// 开头、含该端口
    for (const u of ep.lan) {
      expect(u.startsWith('http://')).toBe(true)
      expect(u.endsWith(':6007')).toBe(true)
    }
  })

  it('lan 地址不含重复项', () => {
    const ep = sessionEndpoints(6000, 'mobile-x')
    expect(new Set(ep.lan).size).toBe(ep.lan.length)
  })

  it('无隧道文件时 tunnel 为 null（而非空串）', () => {
    // 用一个不会被任何实例占用的端口，确保读不到隧道文件
    const ep = sessionEndpoints(5917, 'mobile-x')
    expect(ep.tunnel).toBeNull()
  })

  it('有隧道文件时 tunnel 转为 wss:// 地址', () => {
    const f = tunnelUrlFilePath(6055)
    created.push(f)
    writeFileSync(f, JSON.stringify({ url: 'https://abc-def.trycloudflare.com', at: Date.now() }), 'utf8')
    const ep = sessionEndpoints(6055, 'mobile-x')
    expect(ep.tunnel).toBe('wss://abc-def.trycloudflare.com/mobile/ws')
  })

  it('tunnel 按端口读，不串到别的端口', () => {
    const f = tunnelUrlFilePath(6066)
    created.push(f)
    writeFileSync(f, JSON.stringify({ url: 'https://only-6066.trycloudflare.com', at: Date.now() }), 'utf8')
    // 6067 从未写过 —— 必须为 null，而不是读到 6066 的
    expect(sessionEndpoints(6067, 'mobile-x').tunnel).toBeNull()
    expect(sessionEndpoints(6066, 'mobile-x').tunnel).toContain('only-6066')
  })

  it('resumeSessionId 为 string 或 null（不抛异常）', () => {
    const ep = sessionEndpoints(6000, 'mobile-x')
    expect(ep.resumeSessionId === null || typeof ep.resumeSessionId === 'string').toBe(true)
  })
})
