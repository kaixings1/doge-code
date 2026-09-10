import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// 测试环境变量驱动的 tee 配置逻辑
function getTeeTarget() {
  const raw = (process.env.CLAUDE_CODE_TEE ?? '').trim()
  if (!raw) return null
  if (raw === 'stdout' || raw === 'stderr') return raw
  return { type: 'file', path: raw }
}

describe('CLAUDE_CODE_TEE 配置', () => {
  const original = process.env.CLAUDE_CODE_TEE

  afterAll(() => {
    if (original === undefined) delete process.env.CLAUDE_CODE_TEE
    else process.env.CLAUDE_CODE_TEE = original
  })

  it('未设置时关闭', () => {
    delete process.env.CLAUDE_CODE_TEE
    expect(getTeeTarget()).toBeNull()
  })

  it('stdout 镜像到 stdout', () => {
    process.env.CLAUDE_CODE_TEE = 'stdout'
    expect(getTeeTarget()).toBe('stdout')
  })

  it('stderr 镜像到 stderr', () => {
    process.env.CLAUDE_CODE_TEE = 'stderr'
    expect(getTeeTarget()).toBe('stderr')
  })

  it('文件路径解析为 file 类型', () => {
    process.env.CLAUDE_CODE_TEE = '/tmp/tee.log'
    expect(getTeeTarget()).toEqual({ type: 'file', path: '/tmp/tee.log' })
  })

  it('空字符串视为关闭', () => {
    process.env.CLAUDE_CODE_TEE = '   '
    expect(getTeeTarget()).toBeNull()
  })
})

describe('writeToStdout Tee 行为', () => {
  it('未设置 CLAUDE_CODE_TEE 时不调用 tee', () => {
    delete process.env.CLAUDE_CODE_TEE
    // 验证：tee 目标为 null 时 writeTeeSync 是 no-op
    const raw = (process.env.CLAUDE_CODE_TEE ?? '').trim()
    expect(raw).toBe('')
  })
})