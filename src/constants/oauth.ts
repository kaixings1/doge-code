import { isEnvTruthy } from '../utils/envUtils.js'

// 默认为生产配置，如果启用则覆盖为测试/预发布
type OauthConfigType = 'prod' | 'staging' | 'local'

function getOauthConfigType(): OauthConfigType {
  if (process.env.USER_TYPE === 'ant') {
    if (isEnvTruthy(process.env.USE_LOCAL_OAUTH)) {
      return 'local'
    }
    if (isEnvTruthy(process.env.USE_STAGING_OAUTH)) {
      return 'staging'
    }
  }
  return 'prod'
}

export function fileSuffixForOauthConfig(): string {
  if (process.env.CLAUDE_CODE_CUSTOM_OAUTH_URL) {
    return '-custom-oauth'
  }
  switch (getOauthConfigType()) {
    case 'local':
      return '-local-oauth'
    case 'staging':
      return '-staging-oauth'
    case 'prod':
      // 生产配置无后缀
      return ''
  }
}

export const CLAUDE_AI_INFERENCE_SCOPE = 'user:inference' as const
export const CLAUDE_AI_PROFILE_SCOPE = 'user:profile' as const
const CONSOLE_SCOPE = 'org:create_api_key' as const
export const OAUTH_BETA_HEADER = 'oauth-2025-04-20' as const

// 控制台 OAuth 作用域——用于通过控制台创建 API 密钥
export const CONSOLE_OAUTH_SCOPES = [
  CONSOLE_SCOPE,
  CLAUDE_AI_PROFILE_SCOPE,
] as const

// Claude.ai OAuth 作用域——适用于 Claude.ai 订阅用户（Pro/Max/团队/企业）
export const CLAUDE_AI_OAUTH_SCOPES = [
  CLAUDE_AI_PROFILE_SCOPE,
  CLAUDE_AI_INFERENCE_SCOPE,
  'user:sessions:claude_code',
  'user:mcp_servers',
  'user:file_upload',
] as const

// 所有 OAuth 作用域——Claude CLI 中使用的所有作用域的并集
// 登录时，请求所有作用域以同时处理控制台 -> Claude.ai 重定向
// 确保 apps 仓库中的 `OAuthConsentPage` 与此列表保持同步。
export const ALL_OAUTH_SCOPES = Array.from(
  new Set([...CONSOLE_OAUTH_SCOPES, ...CLAUDE_AI_OAUTH_SCOPES]),
)

type OauthConfig = {
  BASE_API_URL: string
  CONSOLE_AUTHORIZE_URL: string
  CLAUDE_AI_AUTHORIZE_URL: string
  /**
   * claude.ai 的 Web 源。与 CLAUDE_AI_AUTHORIZE_URL 分开，因为
   * 后者现在通过 claude.com/cai/* 进行归因路由——从中派生
   * .origin 将得到 claude.com，从而破坏指向 /code、
   * /settings/connectors 和其他 claude.ai 网页的链接。
   */
  CLAUDE_AI_ORIGIN: string
  TOKEN_URL: string
  API_KEY_URL: string
  ROLES_URL: string
  CONSOLE_SUCCESS_URL: string
  CLAUDEAI_SUCCESS_URL: string
  MANUAL_REDIRECT_URL: string
  CLIENT_ID: string
  OAUTH_FILE_SUFFIX: string
  MCP_PROXY_URL: string
  MCP_PROXY_PATH: string
}

// 生产 OAuth 配置——用于正常操作
const PROD_OAUTH_CONFIG = {
  BASE_API_URL: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
  CONSOLE_AUTHORIZE_URL: 'https://platform.claude.com/oauth/authorize',
  // 通过 claude.com/cai/* 跳转，使 CLI 登录归因于 claude.com
  // 的访问。通过两次 307 跳转到 claude.ai/oauth/authorize。
  CLAUDE_AI_AUTHORIZE_URL: 'https://claude.com/cai/oauth/authorize',
  CLAUDE_AI_ORIGIN: 'https://claude.ai',
  TOKEN_URL: 'https://platform.claude.com/v1/oauth/token',
  API_KEY_URL: `${process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'}/api/oauth/claude_cli/create_api_key`,
  ROLES_URL: `${process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'}/api/oauth/claude_cli/roles`,
  CONSOLE_SUCCESS_URL:
    'https://platform.claude.com/buy_credits?returnUrl=/oauth/code/success%3Fapp%3Dclaude-code',
  CLAUDEAI_SUCCESS_URL:
    'https://platform.claude.com/oauth/code/success?app=claude-code',
  MANUAL_REDIRECT_URL: 'https://platform.claude.com/oauth/code/callback',
  CLIENT_ID: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  // 生产配置无后缀
  OAUTH_FILE_SUFFIX: '',
  MCP_PROXY_URL: 'https://mcp-proxy.anthropic.com',
  MCP_PROXY_PATH: '/v1/mcp/{server_id}',
} as const

/**
 * MCP OAuth 的客户端 ID 元数据文档 URL（CIMD / SEP-991）。
 * 当 MCP 认证服务器声明 client_id_metadata_document_supported: true 时，
 * Claude Code 使用此 URL 作为其 client_id，而非动态客户端注册。
 * 该 URL 必须指向 Anthropic 托管的 JSON 文档。
 * 参见：https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-00
 */
export const MCP_CLIENT_METADATA_URL =
  'https://claude.ai/oauth/claude-code-client-metadata'

// 预发布 OAuth 配置——仅在使用预发布标志的 ant 构建中包含
// 使用字面量检查进行死代码消除
const STAGING_OAUTH_CONFIG =
  process.env.USER_TYPE === 'ant'
    ? ({
        BASE_API_URL: 'https://api-staging.anthropic.com',
        CONSOLE_AUTHORIZE_URL:
          'https://platform.staging.ant.dev/oauth/authorize',
        CLAUDE_AI_AUTHORIZE_URL:
          'https://claude-ai.staging.ant.dev/oauth/authorize',
        CLAUDE_AI_ORIGIN: 'https://claude-ai.staging.ant.dev',
        TOKEN_URL: 'https://platform.staging.ant.dev/v1/oauth/token',
        API_KEY_URL:
          'https://api-staging.anthropic.com/api/oauth/claude_cli/create_api_key',
        ROLES_URL:
          'https://api-staging.anthropic.com/api/oauth/claude_cli/roles',
        CONSOLE_SUCCESS_URL:
          'https://platform.staging.ant.dev/buy_credits?returnUrl=/oauth/code/success%3Fapp%3Dclaude-code',
        CLAUDEAI_SUCCESS_URL:
          'https://platform.staging.ant.dev/oauth/code/success?app=claude-code',
        MANUAL_REDIRECT_URL:
          'https://platform.staging.ant.dev/oauth/code/callback',
        CLIENT_ID: '22422756-60c9-4084-8eb7-27705fd5cf9a',
        OAUTH_FILE_SUFFIX: '-staging-oauth',
        MCP_PROXY_URL: 'https://mcp-proxy-staging.anthropic.com',
        MCP_PROXY_PATH: '/v1/mcp/{server_id}',
      } as const)
    : undefined

// 三个本地开发服务器：:8000 api-proxy（`api dev start -g ccr`）、
// :4000 claude-ai 前端、:3000 控制台前端。环境变量让
// scripts/claude-localhost 可以在布局不同时覆盖。
function getLocalOauthConfig(): OauthConfig {
  const api =
    process.env.CLAUDE_LOCAL_OAUTH_API_BASE?.replace(/\/$/, '') ??
    'http://localhost:8000'
  const apps =
    process.env.CLAUDE_LOCAL_OAUTH_APPS_BASE?.replace(/\/$/, '') ??
    'http://localhost:4000'
  const consoleBase =
    process.env.CLAUDE_LOCAL_OAUTH_CONSOLE_BASE?.replace(/\/$/, '') ??
    'http://localhost:3000'
  return {
    BASE_API_URL: api,
    CONSOLE_AUTHORIZE_URL: `${consoleBase}/oauth/authorize`,
    CLAUDE_AI_AUTHORIZE_URL: `${apps}/oauth/authorize`,
    CLAUDE_AI_ORIGIN: apps,
    TOKEN_URL: `${api}/v1/oauth/token`,
    API_KEY_URL: `${api}/api/oauth/claude_cli/create_api_key`,
    ROLES_URL: `${api}/api/oauth/claude_cli/roles`,
    CONSOLE_SUCCESS_URL: `${consoleBase}/buy_credits?returnUrl=/oauth/code/success%3Fapp%3Dclaude-code`,
    CLAUDEAI_SUCCESS_URL: `${consoleBase}/oauth/code/success?app=claude-code`,
    MANUAL_REDIRECT_URL: `${consoleBase}/oauth/code/callback`,
    CLIENT_ID: '22422756-60c9-4084-8eb7-27705fd5cf9a',
    OAUTH_FILE_SUFFIX: '-local-oauth',
    MCP_PROXY_URL: 'http://localhost:8205',
    MCP_PROXY_PATH: '/v1/toolbox/shttp/mcp/{server_id}',
  }
}
// 允许的 CLAUDE_CODE_CUSTOM_OAUTH_URL 覆盖基础 URL。
// 仅允许 FedStart/PubSec 部署，以防止 OAuth 令牌
// 被发送到任意端点。
const ALLOWED_OAUTH_BASE_URLS = [
  'https://beacon.claude-ai.staging.ant.dev',
  'https://claude.fedstart.com',
  'https://claude-staging.fedstart.com',
]
// 同时也允许 127.0.0.1:8080 用于本地开发代理
const ALLOWED_LOCAL_PROXY_BASE_URLS = ['http://127.0.0.1:8080']

// 默认为生产配置，如果启用则覆盖为测试/预发布
export function getOauthConfig(): OauthConfig {
  let config: OauthConfig = (() => {
    switch (getOauthConfigType()) {
      case 'local':
        return getLocalOauthConfig()
      case 'staging':
        return STAGING_OAUTH_CONFIG ?? PROD_OAUTH_CONFIG
      case 'prod':
        return PROD_OAUTH_CONFIG
    }
  })()

  // 允许覆盖所有 OAuth URL 以指向批准的 FedStart 部署。
  // 仅接受已列入白名单的基础 URL，以防止凭证泄露。
  const oauthBaseUrl = process.env.CLAUDE_CODE_CUSTOM_OAUTH_URL
  if (oauthBaseUrl) {
    const base = oauthBaseUrl.replace(/\/$/, '')

    // 允许本地开发代理（127.0.0.1:8080）
    if (base === 'http://127.0.0.1:8080') {
      return {
        ...config,
        BASE_API_URL: base,
        CONSOLE_AUTHORIZE_URL: `${base}/oauth/authorize`,
        CLAUDE_AI_AUTHORIZE_URL: `${base}/oauth/authorize`,
        CLAUDE_AI_ORIGIN: base,
        TOKEN_URL: `${base}/v1/oauth/token`,
        API_KEY_URL: `${base}/api/oauth/claude_cli/create_api_key`,
        ROLES_URL: `${base}/api/oauth/claude_cli/roles`,
        CONSOLE_SUCCESS_URL: `${base}/oauth/code/success?app=claude-code`,
        CLAUDEAI_SUCCESS_URL: `${base}/oauth/code/success?app=claude-code`,
        MANUAL_REDIRECT_URL: `${base}/oauth/code/callback`,
        OAUTH_FILE_SUFFIX: '-custom-oauth',
      }
    }

    if (!ALLOWED_OAUTH_BASE_URLS.includes(base)) {
      throw new Error(
        'CLAUDE_CODE_CUSTOM_OAUTH_URL is not an approved endpoint.',
      )
    }
    config = {
      ...config,
      BASE_API_URL: base,
      CONSOLE_AUTHORIZE_URL: `${base}/oauth/authorize`,
      CLAUDE_AI_AUTHORIZE_URL: `${base}/oauth/authorize`,
      CLAUDE_AI_ORIGIN: base,
      TOKEN_URL: `${base}/v1/oauth/token`,
      API_KEY_URL: `${base}/api/oauth/claude_cli/create_api_key`,
      ROLES_URL: `${base}/api/oauth/claude_cli/roles`,
      CONSOLE_SUCCESS_URL: `${base}/oauth/code/success?app=claude-code`,
      CLAUDEAI_SUCCESS_URL: `${base}/oauth/code/success?app=claude-code`,
      MANUAL_REDIRECT_URL: `${base}/oauth/code/callback`,
      OAUTH_FILE_SUFFIX: '-custom-oauth',
    }
  }

  // 允许通过环境变量覆盖 CLIENT_ID（例如用于 Xcode 集成）
  const clientIdOverride = process.env.CLAUDE_CODE_OAUTH_CLIENT_ID
  if (clientIdOverride) {
    config = {
      ...config,
      CLIENT_ID: clientIdOverride,
    }
  }

  return config
}
