/**
 * ant0 内部用户权限模式开放的单测。
 *
 * 重点验证 isInternalUserType + isExternalPermissionMode 在不同
 * USER_TYPE 下的行为：ant 和 ant0 都应被视为内部用户，能设置 auto/bubble；
 * 外部用户（'external'/undefined）恒视为 external。
 *
 * 变异验证：把 isInternalUserType 的 ant0 分支移除，ant0 相关用例
 * 应失败，证明 ant0 开放真的起作用（不是靠外部用户恒 true 蒙过）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  isExternalPermissionMode,
  isInternalUserType,
} from '../../src/utils/permissions/PermissionMode.js'

describe('isInternalUserType', () => {
  const orig = process.env.USER_TYPE

  afterEach(() => {
    if (orig === undefined) delete process.env.USER_TYPE
    else process.env.USER_TYPE = orig
  })

  it('USER_TYPE=ant → 内部用户', () => {
    process.env.USER_TYPE = 'ant'
    expect(isInternalUserType()).toBe(true)
  })

  it('USER_TYPE=ant0 → 内部用户（本 fork 标识）', () => {
    process.env.USER_TYPE = 'ant0'
    expect(isInternalUserType()).toBe(true)
  })

  it('USER_TYPE=external → 非内部用户', () => {
    process.env.USER_TYPE = 'external'
    expect(isInternalUserType()).toBe(false)
  })

  it('USER_TYPE 未定义 → 非内部用户', () => {
    delete process.env.USER_TYPE
    expect(isInternalUserType()).toBe(false)
  })

  it('USER_TYPE=任意其他值 → 非内部用户', () => {
    process.env.USER_TYPE = 'unknown'
    expect(isInternalUserType()).toBe(false)
  })
})

describe('isExternalPermissionMode 在 ant0 下的行为', () => {
  const orig = process.env.USER_TYPE

  afterEach(() => {
    if (orig === undefined) delete process.env.USER_TYPE
    else process.env.USER_TYPE = orig
  })

  describe('USER_TYPE=ant0', () => {
    beforeEach(() => {
      process.env.USER_TYPE = 'ant0'
    })

    it('auto 模式 → 视为内部模式（不落 settings.json external 字段）', () => {
      expect(isExternalPermissionMode('auto')).toBe(false)
    })

    it('bubble 模式 → 视为内部模式', () => {
      expect(isExternalPermissionMode('bubble')).toBe(false)
    })

    it('default 模式 → 仍视为 external', () => {
      expect(isExternalPermissionMode('default')).toBe(true)
    })

    it('acceptEdits 模式 → 视为 external', () => {
      expect(isExternalPermissionMode('acceptEdits')).toBe(true)
    })
  })

  describe('USER_TYPE=external（外部用户）', () => {
    beforeEach(() => {
      process.env.USER_TYPE = 'external'
    })

    it('外部用户即使遇到 auto 也视为 external（恒 true）', () => {
      expect(isExternalPermissionMode('auto')).toBe(true)
    })
  })
})
