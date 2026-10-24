/**
 * 模型配置就绪检测回归测试（对应 diff_with_claude.md §5.1 / §7.6）。
 *
 * 变异验证：把 isModelUnconfigured 的基础 URL 判据去掉，或让 hasOAuthToken
 * 不再短路，下面的对应用例会失败。
 */
import { describe, expect, it } from 'vitest'
import {
  UNCONFIGURED_API_KEY,
  UNCONFIGURED_BASE_URL,
  UNCONFIGURED_MODEL,
  buildModelUnconfiguredNotice,
  buildModelUnconfiguredNoticeOneLine,
  isModelUnconfigured,
  readModelReadinessFromEnv,
} from '../../src/utils/modelReadiness.js'

describe('模型配置就绪检测', () => {
  it('bootstrap 哨兵组合被判为未配置', () => {
    expect(
      isModelUnconfigured({
        baseUrl: UNCONFIGURED_BASE_URL,
        apiKey: UNCONFIGURED_API_KEY,
        model: UNCONFIGURED_MODEL,
      }),
    ).toBe(true)
  })

  it('URL 尾斜杠不影响判定', () => {
    expect(
      isModelUnconfigured({
        baseUrl: `${UNCONFIGURED_BASE_URL}/`,
        apiKey: UNCONFIGURED_API_KEY,
      }),
    ).toBe(true)
  })

  it('真实端点即使 Key 是哨兵值也不算未配置', () => {
    expect(
      isModelUnconfigured({
        baseUrl: 'https://api.deepseek.com',
        apiKey: UNCONFIGURED_API_KEY,
        model: 'deepseek-chat',
      }),
    ).toBe(false)
  })

  it('哨兵端点但配置了 OAuth 令牌时不算未配置', () => {
    expect(
      isModelUnconfigured({
        baseUrl: UNCONFIGURED_BASE_URL,
        apiKey: UNCONFIGURED_API_KEY,
        hasOAuthToken: true,
      }),
    ).toBe(false)
  })

  it('哨兵端点但走第三方提供商时不算未配置', () => {
    expect(
      isModelUnconfigured({
        baseUrl: UNCONFIGURED_BASE_URL,
        apiKey: UNCONFIGURED_API_KEY,
        using3PProvider: true,
      }),
    ).toBe(false)
  })

  it('空配置（无 baseUrl）不触发提示', () => {
    expect(isModelUnconfigured({})).toBe(false)
  })

  it('readModelReadinessFromEnv 识别哨兵环境', () => {
    expect(
      readModelReadinessFromEnv({
        ANTHROPIC_BASE_URL: UNCONFIGURED_BASE_URL,
        DOGE_API_KEY: UNCONFIGURED_API_KEY,
        ANTHROPIC_MODEL: UNCONFIGURED_MODEL,
      }),
    ).toBe(true)
    expect(
      readModelReadinessFromEnv({
        ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
        DOGE_API_KEY: 'sk-real',
      }),
    ).toBe(false)
    expect(
      readModelReadinessFromEnv({
        ANTHROPIC_BASE_URL: UNCONFIGURED_BASE_URL,
        CLAUDE_CODE_OAUTH_TOKEN: 'oauth',
      }),
    ).toBe(false)
  })

  it('提示文本给出可执行的配置路径', () => {
    const text = buildModelUnconfiguredNotice()
    expect(text).toContain('.doge/api.json')
    expect(text).toContain('DOGE_API_JSON')
    expect(text).toContain('ANTHROPIC_BASE_URL')
    // 单行版不能含换行，避免污染 -p 的 stderr 结构
    expect(buildModelUnconfiguredNoticeOneLine()).not.toContain('\n')
  })
})
