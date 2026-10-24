/**
 * 模型配置就绪检测。
 *
 * bootstrap-entry.ts 在找不到 `.doge/api.json` 时会把 ANTHROPIC_BASE_URL 指向
 * `http://0.0.0.0:1`、DOGE_API_KEY 设为 `DOGE_FAKE_KEY`、模型设为 `claude-dummy`。
 * 这样能零配置进入交互界面，但请求必然失败——首次使用者容易误判为"程序卡住/模型不响应"。
 *
 * 这里只做纯判定，不负责输出，方便测试与多入口复用。
 */

/** bootstrap-entry 设置的哨兵端点。 */
export const UNCONFIGURED_BASE_URL = 'http://0.0.0.0:1'
/** bootstrap-entry 设置的哨兵 Key。 */
export const UNCONFIGURED_API_KEY = 'DOGE_FAKE_KEY'
/** bootstrap-entry 设置的哨兵模型。 */
export const UNCONFIGURED_MODEL = 'claude-dummy'

export type ModelReadinessInput = {
  baseUrl?: string
  apiKey?: string
  model?: string
  /** 是否设置了 OAuth 令牌（OAuth 用户不需要 api.json）。 */
  hasOAuthToken?: boolean
  /** 第三方提供商（Bedrock/Vertex/Foundry）。 */
  using3PProvider?: boolean
}

/**
 * 判断当前是否处于「未配置模型」的哨兵状态。
 *
 * 判据同时要求 baseUrl 命中哨兵端点，避免把用户自己填成 `DOGE_FAKE_KEY` 的
 * 正常配置误判为未配置。
 */
export function isModelUnconfigured(input: ModelReadinessInput): boolean {
  if (input.hasOAuthToken || input.using3PProvider) return false
  const baseUrl = (input.baseUrl ?? '').replace(/\/+$/, '')
  if (baseUrl !== UNCONFIGURED_BASE_URL) return false
  return (
    (input.apiKey ?? '') === UNCONFIGURED_API_KEY ||
    (input.model ?? '') === UNCONFIGURED_MODEL
  )
}

/** 生成面向用户的、可直接照做的配置指引。 */
export function buildModelUnconfiguredNotice(): string {
  return [
    '未检测到模型配置，本会话的 API 请求会失败（不是程序卡住）。',
    '',
    '请任选一种方式完成配置后重开会话：',
    '  1. 在项目里创建 .doge/api.json，指定 activePreset 与 presets（baseURL / apiKey / model）',
    '  2. 设置环境变量 DOGE_API_JSON 指向已有的 api.json',
    '  3. 设置环境变量 ANTHROPIC_BASE_URL + DOGE_API_KEY（或 CLAUDE_CODE_OAUTH_TOKEN）',
    '',
    '已保存的供应商预设可用 /model 查看，自定义模型用 /add-model <模型名>。',
  ].join('\n')
}

/** -p 模式下的单行提示（避免污染可解析的 stdout 结构，默认走 stderr）。 */
export function buildModelUnconfiguredNoticeOneLine(): string {
  return [
    '未检测到模型配置，请求将失败。',
    '请创建 .doge/api.json（含 activePreset 与 presets），或设置 DOGE_API_JSON / ANTHROPIC_BASE_URL + DOGE_API_KEY。',
  ].join('')
}

/**
 * 从环境变量解析就绪状态。单独抽出来便于测试注入。
 */
export function readModelReadinessFromEnv(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return isModelUnconfigured({
    baseUrl: env.ANTHROPIC_BASE_URL,
    apiKey: env.DOGE_API_KEY,
    model: env.ANTHROPIC_MODEL,
    hasOAuthToken: Boolean(
      env.CLAUDE_CODE_OAUTH_TOKEN || env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR,
    ),
    using3PProvider: Boolean(
      env.CLAUDE_CODE_USE_BEDROCK ||
        env.CLAUDE_CODE_USE_VERTEX ||
        env.CLAUDE_CODE_USE_FOUNDRY,
    ),
  })
}
