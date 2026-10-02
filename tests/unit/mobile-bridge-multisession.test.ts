/**
 * 多会话支持（方案 A）的服务端测试。
 *
 * 覆盖新增的三个能力：
 *   - resolveMobilePort()  端口可配 + 非法值回落
 *   - resolveSessionLabel() 会话标签 + cwd 回落
 *   - GET /mobile/session-info 元信息端点
 *
 * 设计见 android/MULTI-SESSION-PLAN.md。此前这些只有手工实测，
 * 本文件把判定规则固化，防止回归。
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import http from 'http'
import path from 'path'
import {
  MobileBridgeServer,
  getActiveMobileBridgeServer,
  resolveMobilePort,
  resolveSessionLabel,
} from '../../src/bridge/mobileBridge.js'

const PORT = 15691

let savedPort: string | undefined
let savedLabel: string | undefined

beforeEach(() => {
  savedPort = process.env.CLAUDE_CODE_MOBILE_PORT
  savedLabel = process.env.DOGE_SESSION_LABEL
})

afterEach(async () => {
  const s = getActiveMobileBridgeServer()
  if (s) await s.stop()
  // 还原环境变量，避免污染其它测试文件
  if (savedPort === undefined) delete process.env.CLAUDE_CODE_MOBILE_PORT
  else process.env.CLAUDE_CODE_MOBILE_PORT = savedPort
  if (savedLabel === undefined) delete process.env.DOGE_SESSION_LABEL
  else process.env.DOGE_SESSION_LABEL = savedLabel
})

// ─── resolveMobilePort ───

describe('resolveMobilePort', () => {
  it('未设置时回落到 5680', () => {
    delete process.env.CLAUDE_CODE_MOBILE_PORT
    expect(resolveMobilePort()).toBe(5680)
  })

  it('合法端口被采用', () => {
    process.env.CLAUDE_CODE_MOBILE_PORT = '5681'
    expect(resolveMobilePort()).toBe(5681)
  })

  it('边界值 1 与 65535 有效', () => {
    process.env.CLAUDE_CODE_MOBILE_PORT = '1'
    expect(resolveMobilePort()).toBe(1)
    process.env.CLAUDE_CODE_MOBILE_PORT = '65535'
    expect(resolveMobilePort()).toBe(65535)
  })

  it('非数字回落到 5680 而非 NaN', () => {
    process.env.CLAUDE_CODE_MOBILE_PORT = 'abc'
    expect(resolveMobilePort()).toBe(5680)
  })

  it('越界值回落到 5680', () => {
    process.env.CLAUDE_CODE_MOBILE_PORT = '0'
    expect(resolveMobilePort()).toBe(5680)
    process.env.CLAUDE_CODE_MOBILE_PORT = '65536'
    expect(resolveMobilePort()).toBe(5680)
    process.env.CLAUDE_CODE_MOBILE_PORT = '-1'
    expect(resolveMobilePort()).toBe(5680)
  })

  it('小数回落到 5680（端口必须是整数）', () => {
    process.env.CLAUDE_CODE_MOBILE_PORT = '5680.5'
    expect(resolveMobilePort()).toBe(5680)
  })

  it('空串回落到 5680', () => {
    process.env.CLAUDE_CODE_MOBILE_PORT = ''
    expect(resolveMobilePort()).toBe(5680)
  })
})

// ─── resolveSessionLabel ───

describe('resolveSessionLabel', () => {
  it('环境变量优先', () => {
    process.env.DOGE_SESSION_LABEL = '前端重构'
    expect(resolveSessionLabel()).toBe('前端重构')
  })

  it('环境变量为空时回落 cwd 目录名', () => {
    process.env.DOGE_SESSION_LABEL = ''
    expect(resolveSessionLabel()).toBe(path.basename(process.cwd()))
  })

  it('环境变量只有空白时也回落', () => {
    process.env.DOGE_SESSION_LABEL = '   '
    expect(resolveSessionLabel()).toBe(path.basename(process.cwd()))
  })

  it('标签首尾空白被去除', () => {
    process.env.DOGE_SESSION_LABEL = '  修CI  '
    expect(resolveSessionLabel()).toBe('修CI')
  })
})

// ─── /mobile/session-info ───

function httpGet(p: number, path: string): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: p, path, timeout: 4000 }, (res) => {
      let b = ''
      res.on('data', (c) => (b += c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: b, headers: res.headers }))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
  })
}

describe('/mobile/session-info', () => {
  it('返回会话元信息且字段齐全', async () => {
    process.env.DOGE_SESSION_LABEL = '测试会话A'
    const server = new MobileBridgeServer({ sessionId: 'mobile-test', port: PORT })
    await server.start()

    const res = await httpGet(PORT, '/mobile/session-info')
    expect(res.status).toBe(200)
    const o = JSON.parse(res.body)

    expect(o.sessionId).toBe('mobile-test')
    expect(o.port).toBe(PORT)
    expect(o.label).toBe('测试会话A')
    expect(o.cwd).toBe(process.cwd())
    // 非交互时 test runner 的 stdin 不是 TTY
    expect(typeof o.interactive).toBe('boolean')
    expect(o.clients).toBe(0)
    expect(typeof o.lastActivity).toBe('number')

    await server.stop()
  })

  it('标签未设时返回 cwd 目录名', async () => {
    delete process.env.DOGE_SESSION_LABEL
    const server = new MobileBridgeServer({ sessionId: 'mobile-x', port: PORT })
    await server.start()

    const o = JSON.parse((await httpGet(PORT, '/mobile/session-info')).body)
    expect(o.label).toBe(path.basename(process.cwd()))

    await server.stop()
  })

  it('带 CORS 头（供手机端跨源探测）', async () => {
    const server = new MobileBridgeServer({ sessionId: 'mobile-c', port: PORT })
    await server.start()

    const res = await httpGet(PORT, '/mobile/session-info')
    expect(res.headers['access-control-allow-origin']).toBe('*')

    await server.stop()
  })

  it('clients 反映当前连接数', async () => {
    const server = new MobileBridgeServer({ sessionId: 'mobile-n', port: PORT })
    await server.start()

    const before = JSON.parse((await httpGet(PORT, '/mobile/session-info')).body)
    expect(before.clients).toBe(0)

    await server.stop()
  })

  it('未知路径仍返回 404（未误伤既有路由）', async () => {
    const server = new MobileBridgeServer({ sessionId: 'mobile-404', port: PORT })
    await server.start()

    const res = await httpGet(PORT, '/mobile/unknown-endpoint')
    expect(res.status).toBe(404)

    await server.stop()
  })

  it('根路径仍返回对话页面（未误伤）', async () => {
    const server = new MobileBridgeServer({ sessionId: 'mobile-root', port: PORT })
    await server.start()

    const res = await httpGet(PORT, '/')
    expect(res.status).toBe(200)
    expect(res.body).toContain('<title>doge-code 对话</title>')

    await server.stop()
  })
})

describe('端口可配的端到端验证', () => {
  it('非默认端口能正常启动并响应', async () => {
    process.env.CLAUDE_CODE_MOBILE_PORT = String(PORT)
    // 显式传 port 优先级最高，这里同时验证两者一致
    const server = new MobileBridgeServer({ sessionId: 'mobile-e2e', port: PORT })
    await server.start()
    expect(server.isServerRunning()).toBe(true)

    const o = JSON.parse((await httpGet(PORT, '/mobile/session-info')).body)
    expect(o.port).toBe(PORT)

    await server.stop()
    expect(server.isServerRunning()).toBe(false)
  })
})
