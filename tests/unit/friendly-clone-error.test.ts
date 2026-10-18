/**
 * friendlyCloneError 单测。
 *
 * 背景：marketplaceManager 的 git 克隆失败时，原先抛出裸
 * `克隆 marketplace 仓库失败：${stderr}`，模型/用户无法自助定位。
 * friendlyCloneError 按 classifyFetchError 的类别给出中文友好提示
 * （网络/认证/仓库不存在/超时等）。
 *
 * 变异验证：若把某 case 的中文文案改错（如把 dns 文案与 timeout 文案互换），
 * 对应用例应失败；若把 default 分支误用于 dns 类错误，dns 用例应失败。
 */
import { describe, it, expect } from 'vitest'
import { friendlyCloneError } from '../../src/utils/plugins/marketplaceManager.js'

describe('friendlyCloneError', () => {
  it('DNS/连接被拒 → 中文提示含网络诊断', () => {
    const msg = friendlyCloneError('fatal: Could not resolve host: github.com')
    expect(msg).toContain('域名无法解析')
    expect(msg).toContain('github.com')
  })

  it('超时 → 中文提示含超时诊断', () => {
    const msg = friendlyCloneError('fatal: unable to access: Operation timed out')
    expect(msg).toContain('连接超时')
  })

  it('认证失败 → 中文提示含凭证建议', () => {
    const msg = friendlyCloneError('remote error: Authentication failed (403)')
    expect(msg).toContain('认证被拒绝')
    expect(msg).toContain('PAT')
  })

  it('仓库不存在 → 中文提示含 404 诊断', () => {
    const msg = friendlyCloneError('fatal: repository not found')
    expect(msg).toContain('仓库不存在')
  })

  it('TLS 错误 → 中文提示含证书诊断', () => {
    const msg = friendlyCloneError('SSL certificate problem: unable to get local issuer')
    expect(msg).toContain('TLS/证书错误')
  })

  it('未知错误 → 回退原始 stderr', () => {
    const msg = friendlyCloneError('some weird failure')
    expect(msg).toContain('克隆 marketplace 仓库失败')
    expect(msg).toContain('some weird failure')
  })

  it('空 stderr → 不崩溃，回退分支', () => {
    const msg = friendlyCloneError('')
    expect(msg).toContain('克隆 marketplace 仓库失败')
    expect(msg).toContain('无错误输出')
  })
})
