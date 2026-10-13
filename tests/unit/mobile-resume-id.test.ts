/**
 * 会话恢复 ID 的回传测试（线 D3）。
 *
 * **这是本次最容易出错的一点**：移动桥接有两个「sessionId」，
 * 拿错了会让用户敲一条必然失败的命令 —— 比不显示更糟
 * （用户以为功能坏了，会反复试）。
 *
 * | 名称 | 值 | 用途 |
 * |---|---|---|
 * | `this.sessionId` | `mobile-<时间戳>` | 移动桥接自造，仅内部标识 |
 * | `resumeSessionId` | doge 的真实会话 ID | 供 `doge.exe --resume <id>` |
 *
 * 变异验证：把 resumeSessionId 改成返回 this.sessionId，
 * 「resumeSessionId 不是移动桥接自造的 id」用例失败。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { MobileBridgeServer, getActiveMobileBridgeServer } from '../../src/bridge/mobileBridge.js'
import http from 'http'

const PORT = 15697

afterEach(async () => {
  const s = getActiveMobileBridgeServer()
  if (s) await s.stop()
})

function httpGet(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: 4000 }, res => {
      let b = ''
      res.on('data', c => (b += c))
      res.on('end', () => resolve(b))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

describe('session-info 的 resumeSessionId', () => {
  it('返回 resumeSessionId 字段', async () => {
    const server = new MobileBridgeServer({ sessionId: 'mobile-test', port: PORT })
    await server.start()
    const o = JSON.parse(await httpGet('/mobile/session-info'))
    expect('resumeSessionId' in o).toBe(true)
    await server.stop()
  })

  it('resumeSessionId 不是移动桥接自造的那个 id（关键）', async () => {
    // 这是本测试的核心：两个字段必须不同。
    // 若相同，说明实现直接用 this.sessionId 充当恢复 id ——
    // 用户拿它 --resume 必然失败。
    const server = new MobileBridgeServer({ sessionId: 'mobile-1790000000000', port: PORT })
    await server.start()
    const o = JSON.parse(await httpGet('/mobile/session-info'))

    expect(o.sessionId).toBe('mobile-1790000000000')
    expect(o.resumeSessionId).not.toBe('mobile-1790000000000')
    // 且不应是 mobile- 前缀（那是移动桥接的命名空间）
    if (o.resumeSessionId !== null) {
      expect(String(o.resumeSessionId).startsWith('mobile-')).toBe(false)
    }
    await server.stop()
  })

  it('取不到真实会话 ID 时为 null 而非空串或假值', async () => {
    // 客户端据此**不显示**恢复命令。空串会让客户端显示
    // "doge.exe --resume "（一条错的命令）。
    const server = new MobileBridgeServer({ sessionId: 'mobile-x', port: PORT })
    await server.start()
    const o = JSON.parse(await httpGet('/mobile/session-info'))
    if (o.resumeSessionId !== null) {
      expect(typeof o.resumeSessionId).toBe('string')
      expect(o.resumeSessionId.length).toBeGreaterThan(0)
    }
    await server.stop()
  })

  it('resumeSessionId 存在时是非空的字符串或 null', async () => {
    const server = new MobileBridgeServer({ sessionId: 'mobile-y', port: PORT })
    await server.start()
    const o = JSON.parse(await httpGet('/mobile/session-info'))
    const v = o.resumeSessionId
    expect(v === null || (typeof v === 'string' && v.length > 0)).toBe(true)
    await server.stop()
  })
})
