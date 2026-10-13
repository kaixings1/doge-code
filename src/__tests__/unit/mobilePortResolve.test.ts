import { describe, expect, it, afterEach } from 'vitest'
import { DEFAULT_MOBILE_PORT, resolveMobilePort } from '../../bridge/mobileBridge.js'

/**
 * resolveMobilePort 契约测试。
 *
 * 存在意义：该默认值必须与 Android 客户端扫描起始端口一致，
 * 否则「手机扫不到会话」——这类不一致不会报错，只会静默失灵。
 * 若有人改回 5680，此测试会失败并提示需同步客户端。
 */
describe('resolveMobilePort', () => {
  const original = process.env.CLAUDE_CODE_MOBILE_PORT

  afterEach(() => {
    if (original === undefined) delete process.env.CLAUDE_CODE_MOBILE_PORT
    else process.env.CLAUDE_CODE_MOBILE_PORT = original
  })

  it('未设置时回落到 DEFAULT_MOBILE_PORT（6000，非旧的 5680）', () => {
    delete process.env.CLAUDE_CODE_MOBILE_PORT
    expect(resolveMobilePort()).toBe(DEFAULT_MOBILE_PORT)
    // 明确锁定：5680-5880 常被 Windows 保留（EACCES），不再作默认值
    expect(DEFAULT_MOBILE_PORT).toBe(6000)
  })

  it('读取合法的 CLAUDE_CODE_MOBILE_PORT', () => {
    process.env.CLAUDE_CODE_MOBILE_PORT = '6005'
    expect(resolveMobilePort()).toBe(6005)
  })

  it('非法值回落默认端口而非抛错', () => {
    process.env.CLAUDE_CODE_MOBILE_PORT = 'abc'
    expect(resolveMobilePort()).toBe(DEFAULT_MOBILE_PORT)
  })

  it('越界端口回落默认端口', () => {
    process.env.CLAUDE_CODE_MOBILE_PORT = '70000'
    expect(resolveMobilePort()).toBe(DEFAULT_MOBILE_PORT)
    process.env.CLAUDE_CODE_MOBILE_PORT = '0'
    expect(resolveMobilePort()).toBe(DEFAULT_MOBILE_PORT)
  })

  it('变量为空字符串时回落默认端口', () => {
    process.env.CLAUDE_CODE_MOBILE_PORT = ''
    expect(resolveMobilePort()).toBe(DEFAULT_MOBILE_PORT)
  })
})
