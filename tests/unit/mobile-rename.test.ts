/**
 * 会话重命名的服务端逻辑测试。
 *
 * 相关背景：本项目的「会话」= 一个活着的 CLI 进程，因此重命名**只作用
 * 于进程内存**，不写环境变量也不写配置文件 —— 写盘会让用户以为改名
 * 持久化了，下次启动发现变回目录名反而更困惑。
 *
 * 校验必须放在服务端而不是只靠客户端：客户端可能是不受控的实现
 * （本项目就有 Android 与浏览器两个客户端），服务端必须自己守边界。
 *
 * 变异验证：去掉控制字符过滤，则「控制字符被去除」用例失败。
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { renameSession, resolveSessionLabel, resetRuntimeSessionLabel } from '../../src/bridge/mobileBridge.js'

let savedEnv: string | undefined

beforeEach(() => {
  savedEnv = process.env.DOGE_SESSION_LABEL
  resetRuntimeSessionLabel()
})

afterEach(() => {
  resetRuntimeSessionLabel()
  if (savedEnv === undefined) delete process.env.DOGE_SESSION_LABEL
  else process.env.DOGE_SESSION_LABEL = savedEnv
})

describe('renameSession', () => {
  it('正常重命名并立即生效', () => {
    expect(renameSession('前端重构')).toBe('前端重构')
    expect(resolveSessionLabel()).toBe('前端重构')
  })

  it('运行时名称优先于环境变量', () => {
    // 用户在手机上刚改的名字应当压过启动时的配置
    process.env.DOGE_SESSION_LABEL = '启动时的名字'
    renameSession('运行时改的')
    expect(resolveSessionLabel()).toBe('运行时改的')
  })

  it('去除首尾空白', () => {
    expect(renameSession('  修CI  ')).toBe('修CI')
  })

  it('控制字符被去除（防渲染错乱与注入）', () => {
    // 换行/制表/退格等会让手机端列表渲染错乱
    const r = renameSession('前\u0000端\u001b重\u007f构')
    expect(r).toBe('前端重构')
    expect(r).not.toMatch(/[\u0000-\u001f\u007f]/)
  })

  it('超长被截断到 40 字', () => {
    const long = 'x'.repeat(200)
    expect(renameSession(long).length).toBe(40)
  })

  it('空串不生效（保持原名）', () => {
    process.env.DOGE_SESSION_LABEL = '原名'
    expect(renameSession('')).toBe('原名')
    expect(renameSession('   ')).toBe('原名')
  })

  it('清空后再改仍可用（空串不该清掉已有名字）', () => {
    renameSession('第一版')
    renameSession('')
    expect(resolveSessionLabel()).toBe('第一版')
  })

  it('非字符串入参安全回落', () => {
    // 客户端可能传错类型；服务端不该崩，也不该把它 stringify 成 "undefined"
    renameSession('有效名')
    expect(renameSession(undefined)).toBe('有效名')
    expect(renameSession(123)).toBe('有效名')
    expect(renameSession(null)).toBe('有效名')
    expect(renameSession({})).toBe('有效名')
  })

  it('未重命名时回落顺序：环境变量 > 目录名', () => {
    process.env.DOGE_SESSION_LABEL = 'env名'
    expect(resolveSessionLabel()).toBe('env名')
    process.env.DOGE_SESSION_LABEL = ''
    expect(resolveSessionLabel()).not.toBe('env名')
  })

  it('只允许中英文数字等常规字符（表情等不应导致异常）', () => {
    // 表情本身合法，但这里验证不抛异常且能返回
    expect(() => renameSession('修复 🐛 bug')).not.toThrow()
    expect(renameSession('修复 🐛 bug')).toBe('修复 🐛 bug')
  })
})
