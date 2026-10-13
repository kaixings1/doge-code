/**
 * 配置值来源回传的测试（线 C3）。
 *
 * 为什么需要来源：用户「改不成」某项时（如设了模型但没生效），
 * 原界面完全无法解释原因。最常见的是**环境变量覆盖** ——
 * 例如 CLAUDE_CODE_EFFORT_LEVEL 会覆盖 effort 设置，而用户看不出来。
 *
 * 回传来源后，界面能提示「被环境变量覆盖」，用户自己就能判断。
 *
 * 变异验证：把 model 来源的 env 分支去掉（永远返回 settings），
 * 「环境变量存在时来源为 env」用例失败。
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import {
  currentMobileConfig,
  recordMobileOverride,
  resetMobileOverrides,
} from '../../src/bridge/mobileBridge.js'

const ENV_KEYS = ['ANTHROPIC_MODEL', 'CLAUDE_CODE_MODEL', 'CLAUDE_CODE_EFFORT_LEVEL']
let saved: Record<string, string | undefined> = {}

beforeEach(() => {
  saved = {}
  ENV_KEYS.forEach(k => {
    saved[k] = process.env[k]
    delete process.env[k]
  })
  resetMobileOverrides()
})

afterEach(() => {
  ENV_KEYS.forEach(k => {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  })
  resetMobileOverrides()
})

describe('currentMobileConfig 的来源标注', () => {
  it('手机端改过则来源为 mobile', () => {
    recordMobileOverride('model', 'claude-sonnet-4-6')
    recordMobileOverride('thinkingTokens', 4096)
    recordMobileOverride('permissionMode', 'plan')

    const c = currentMobileConfig()
    expect(c.sources.model).toBe('mobile')
    expect(c.sources.thinkingTokens).toBe('mobile')
    expect(c.sources.permissionMode).toBe('mobile')
  })

  it('未改过时模型来源为 settings（回落用户配置）', () => {
    const c = currentMobileConfig()
    expect(c.sources.model).toBe('settings')
  })

  it('环境变量存在时模型来源为 env', () => {
    // 这是最需要提示的场景：用户设了环境变量，改手机端设置不会生效
    process.env.ANTHROPIC_MODEL = 'some-model'
    const c = currentMobileConfig()
    expect(c.sources.model).toBe('env')
  })

  it('CLAUDE_CODE_MODEL 也算环境变量来源', () => {
    process.env.CLAUDE_CODE_MODEL = 'x'
    expect(currentMobileConfig().sources.model).toBe('env')
  })

  it('手机端改过时环境变量不影响来源（mobile 优先）', () => {
    // 手机端改的就是当前生效值，故来源是 mobile 而非 env
    process.env.ANTHROPIC_MODEL = 'x'
    recordMobileOverride('model', 'claude-opus-4-6')
    expect(currentMobileConfig().sources.model).toBe('mobile')
  })

  it('思考强度的环境变量来源', () => {
    process.env.CLAUDE_CODE_EFFORT_LEVEL = 'high'
    expect(currentMobileConfig().sources.thinkingTokens).toBe('env')
  })

  it('未改过且无环境变量时思考强度来源为 default', () => {
    expect(currentMobileConfig().sources.thinkingTokens).toBe('default')
  })

  it('未改过时权限模式来源为 default', () => {
    // 权限模式在服务端拿不到 React 状态，只能标 default
    expect(currentMobileConfig().sources.permissionMode).toBe('default')
  })

  it('三个来源字段始终存在（客户端不该拿到 undefined）', () => {
    const c = currentMobileConfig()
    expect(c.sources).toBeTruthy()
    expect(c.sources.model).toBeTruthy()
    expect(c.sources.thinkingTokens).toBeTruthy()
    expect(c.sources.permissionMode).toBeTruthy()
  })

  it('来源改动不影响值本身', () => {
    // 回归：加 sources 字段不该改变原有三项的值
    recordMobileOverride('model', 'sonnet')
    const c = currentMobileConfig()
    expect(c.model).toBe('sonnet')
    expect(c.thinkingTokens).toBe(0)
    expect(c.permissionMode).toBe('default')
  })
})
