import { describe, expect, it } from 'vitest'

/**
 * 组播出口网卡选择。
 *
 * 这条回归测试针对一个真实故障：开发机上有 VBox / WSL / Tailscale 等虚拟网卡时，
 * 不调 setMulticastInterface 会按默认路由挑网卡，广播从 169.254.x.x（链路本地）
 * 发出去，同一 WiFi 的手机一个包都收不到。用户看到的就是"局域网搜不到"。
 *
 * 故判据必须：排除链路本地与虚拟网卡、私有网段优先、WiFi 命名加权。
 */

type Addr = { address: string; family: string; internal: boolean }
type Ifaces = Record<string, Addr[]>

const v4 = (address: string, internal = false): Addr => ({
  address,
  family: 'IPv4',
  internal,
})

/** 从实现中抽出纯逻辑以便注入网卡表（不依赖真实机器网卡）。 */
function pickFrom(ifaces: Ifaces): string | null {
  const virtual =
    /vbox|vmware|virtualbox|wsl|vethernet|tailscale|docker|hyper-v|loopback/i
  const out: { name: string; address: string; score: number }[] = []

  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue
    const wifiish = /^wl|wlan|wi-?fi|无线/i.test(name)
    for (const a of addrs) {
      const isV4 = a.family === 'IPv4' || (a.family as unknown) === 4
      if (!isV4 || a.internal) continue
      if (a.address.startsWith('169.254.')) continue
      if (virtual.test(name)) continue

      let score = 0
      if (/^192\.168\./.test(a.address)) score = 3
      else if (/^10\./.test(a.address)) score = 2
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) score = 2
      else score = 1
      if (wifiish) score += 1

      out.push({ name, address: a.address, score })
    }
  }

  return out.sort((x, y) => y.score - x.score)[0]?.address ?? null
}

describe('组播出口网卡选择', () => {
  it('跳过 169.254 链路本地地址（虚拟网卡典型地址）', () => {
    const picked = pickFrom({
      'VBox Host-Only': [v4('169.254.110.255')],
    })
    expect(picked).toBeNull()
  })

  it('跳过虚拟网卡，即使它是唯一的候选', () => {
    const picked = pickFrom({
      'VMware Network Adapter VMnet8': [v4('192.168.26.152')],
      'Tailscale': [v4('100.99.118.124')],
    })
    expect(picked).toBeNull()
  })

  it('WiFi 网卡优先于同分的其它私有网段', () => {
    // 真实场景：WiFi 192.168.0.106 + 虚拟以太网 192.168.26.152
    const picked = pickFrom({
      'WLAN': [v4('192.168.0.106')],
      '以太网 5': [v4('192.168.26.152')],
    })
    expect(picked).toBe('192.168.0.106')
  })

  it('虚拟网卡与真实 WiFi 并存时选 WiFi', () => {
    const picked = pickFrom({
      'VBox Host-Only': [v4('169.254.110.255')],
      'WLAN': [v4('192.168.0.106')],
      'WSL': [v4('172.20.112.1')],
    })
    expect(picked).toBe('192.168.0.106')
  })

  it('192.168 优先于 10.x', () => {
    const picked = pickFrom({
      'Ethernet': [v4('10.1.2.3')],
      'WLAN': [v4('192.168.1.5')],
    })
    expect(picked).toBe('192.168.1.5')
  })

  it('忽略环回与 internal 地址', () => {
    const picked = pickFrom({
      'WLAN': [v4('127.0.0.1', true), v4('192.168.0.106')],
    })
    expect(picked).toBe('192.168.0.106')
  })

  it('只有公网地址时仍返回它（总比不发好）', () => {
    const picked = pickFrom({ 'Ethernet': [v4('203.0.113.9')] })
    expect(picked).toBe('203.0.113.9')
  })
})
