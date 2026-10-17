/**
 * isTranscriptClassifierEnabled 单测：双层开关（feature() 编译期 + env 运行时）
 *
 * 重点验证 env 兜底路径（dev 模式下 auto 模式可用）。
 * 变异验证：移除 env 兜底分支，env 相关用例应失败。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  isTranscriptClassifierEnabled,
  PERMISSION_MODES,
} from '../../src/types/permissions.js'

describe('isTranscriptClassifierEnabled', () => {
  const orig = process.env.CLAUDE_CODE_FEATURE_TRANSCRIPT_CLASSIFIER

  afterEach(() => {
    if (orig === undefined) delete process.env.CLAUDE_CODE_FEATURE_TRANSCRIPT_CLASSIFIER
    else process.env.CLAUDE_CODE_FEATURE_TRANSCRIPT_CLASSIFIER = orig
  })

  // 注意：feature('TRANSCRIPT_CLASSIFIER') 在测试环境恒 false
  // （tests/setup.ts:22 globalThis.feature=()=>false），故只测 env 路径。
  it('env=1 → true（dev 兜底生效）', () => {
    process.env.CLAUDE_CODE_FEATURE_TRANSCRIPT_CLASSIFIER = '1'
    expect(isTranscriptClassifierEnabled()).toBe(true)
  })

  it('env=true → true', () => {
    process.env.CLAUDE_CODE_FEATURE_TRANSCRIPT_CLASSIFIER = 'true'
    expect(isTranscriptClassifierEnabled()).toBe(true)
  })

  it('env=0 → false', () => {
    process.env.CLAUDE_CODE_FEATURE_TRANSCRIPT_CLASSIFIER = '0'
    expect(isTranscriptClassifierEnabled()).toBe(false)
  })

  it('env=false → false', () => {
    process.env.CLAUDE_CODE_FEATURE_TRANSCRIPT_CLASSIFIER = 'false'
    expect(isTranscriptClassifierEnabled()).toBe(false)
  })

  it('env 未定义 → false（仅靠 feature()，测试环境恒 false）', () => {
    delete process.env.CLAUDE_CODE_FEATURE_TRANSCRIPT_CLASSIFIER
    expect(isTranscriptClassifierEnabled()).toBe(false)
  })

  it('env=空串 → false', () => {
    process.env.CLAUDE_CODE_FEATURE_TRANSCRIPT_CLASSIFIER = ''
    expect(isTranscriptClassifierEnabled()).toBe(false)
  })

  it('env=大小写混合 YES → true', () => {
    process.env.CLAUDE_CODE_FEATURE_TRANSCRIPT_CLASSIFIER = 'YES'
    expect(isTranscriptClassifierEnabled()).toBe(true)
  })
})

describe('PERMISSION_MODES 与 env 同步', () => {
  // 注意：PERMISSION_MODES 在模块顶层求值（types/permissions.ts:50），
  // tests/setup.ts:13-17 会删除所有 CLAUDE_CODE_FEATURE_* env，
  // 故测试环境 PERMISSION_MODES 不含 auto。这是测试隔离的真实契约，
  // 不是 bug。生产环境（d.bat / doge.exe）env 已注入才含 auto。
  it('PERMISSION_MODES 在测试环境（env 被清）不含 auto', () => {
    expect((PERMISSION_MODES as readonly string[]).includes('auto')).toBe(false)
  })
})
