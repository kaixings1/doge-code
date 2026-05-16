import { feature } from 'bun:bundle'
import Anthropic from '@anthropic-ai/sdk'
import type { ClientOptions } from '@anthropic-ai/sdk/client'
import * as vertexSdk from '@anthropic-ai/vertex-sdk'
import type AnthropicVertex from '@anthropic-ai/vertex-sdk'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import { getSmallFastModel, getAWSRegion, getVertexRegionForModel } from '../../utils/envUtils.js'
import {
  getAnthropicApiKey,
  getApiKeyFromApiKeyHelper,
  getClaudeAIOAuthTokens,
  isClaudeAISubscriber,
  checkAndRefreshOAuthTokenIfNeeded,
} from '../../utils/auth.js'
import { readCustomApiStorage } from '../../utils/customApiStorage.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { logForDebugging } from '../../utils/debug.js'
import { getSmallFastModel } from '../../utils/model/model.js'
import {
  getAPIProvider,
  isFirstPartyAnthropicBaseUrl,
} from '../../utils/model/providers.js'
import { getProxyFetchOptions } from '../../utils/proxy.js'
import { getSessionId } from '../../bootstrap/state.js'
import { loadGoogleAuthLibrary } from '../../utils/googleAuthLibrary.js'
import { refreshGcpCredentialsIfNeeded } from '../../utils/auth.js'
import { refreshAndGetAwsCredentials } from '../../utils/auth.js'
import { getGlobalConfig } from '../../utils/config.js'
import { OAuthService } from '../oauth/index.js'

const USER_AGENT = 'claude-code/1.0'

function getUserAgent(): string {
  return USER_AGENT
}

function getOauthConfig() {
  const config = getGlobalConfig()
  return config.oauthConfig || { BASE_API_URL: 'https://api.anthropic.com' }
}

const isDebugToStdErr = () => process.env.DEBUG === 'true' || process.env.DEBUG === 'stderr'

export async function getAnthropicClient({
  apiKey,
  maxRetries,
  model,
  fetchOverride,
  source,
}: {
  apiKey?: string
  maxRetries: number
  model?: string
  fetchOverride?: ClientOptions['fetch']
  source?: string
}): Promise<Anthropic> {
  const customApiProvider =
    readCustomApiStorage().provider ?? getGlobalCompatProvider()
  const containerId = process.env.CLAUDE_CODE_CONTAINER_ID
  const remoteSessionId = process.env.CLAUDE_CODE_REMOTE_SESSION_ID
  const clientApp = process.env.CLAUDE_AGENT_SDK_CLIENT_APP
  const customHeaders = getCustomHeaders()
  const defaultHeaders: { [key: string]: string } = {
    'x-app': 'cli',
    'User-Agent': getUserAgent(),
    'X-Claude-Code-Session-Id': getSessionId(),
    ...customHeaders,
    ...(containerId ? { 'x-claude-remote-container-id': containerId } : {}),
    ...(remoteSessionId
      ? { 'x-claude-remote-session-id': remoteSessionId }
      : {}),
    // SDK 消费者可标识其应用/库以便后端分析
    ...(clientApp ? { 'x-client-app': clientApp } : {}),
  }

  // 记录 API 客户端配置，用于 HFI 调试
  logForDebugging(
    `[API:request] Creating client, ANTHROPIC_CUSTOM_HEADERS present: ${!!process.env.ANTHROPIC_CUSTOM_HEADERS}, has Authorization header: ${!!customHeaders['Authorization']}`,
  )

  // 如果环境变量启用，则添加额外的保护头
  const additionalProtectionEnabled = isEnvTruthy(
    process.env.CLAUDE_CODE_ADDITIONAL_PROTECTION,
  )
  if (additionalProtectionEnabled) {
    defaultHeaders['x-anthropic-additional-protection'] = 'true'
  }

  logForDebugging('[API:auth] OAuth token check starting')
  await checkAndRefreshOAuthTokenIfNeeded()
  logForDebugging('[API:auth] OAuth token check complete')

  if (!isClaudeAISubscriber()) {
    await configureApiKeyHeaders(defaultHeaders, getIsNonInteractiveSession())
  }

  const resolvedFetch = buildFetch(fetchOverride, source)

  const ARGS = {
    defaultHeaders,
    maxRetries,
    timeout: parseInt(process.env.API_TIMEOUT_MS || String(600 * 1000), 10),
    dangerouslyAllowBrowser: true,
    fetchOptions: getProxyFetchOptions({
      forAnthropicAPI: true,
    }) as ClientOptions['fetchOptions'],
    ...(resolvedFetch && {
      fetch: resolvedFetch,
    }),
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)) {
    const { AnthropicBedrock } = await import('@anthropic-ai/bedrock-sdk')
    // 如果指定了小快速模型，使用区域覆盖
    const awsRegion =
      model === getSmallFastModel() &&
      process.env.ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION
        ? process.env.ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION
        : getAWSRegion()

    const bedrockArgs: ConstructorParameters<typeof AnthropicBedrock>[0] = {
      ...ARGS,
      awsRegion,
      ...(isEnvTruthy(process.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH) && {
        skipAuth: true,
      }),
      ...(isDebugToStdErr() && { logger: createStderrLogger() }),
    }

    // 添加 API 密钥认证（如果可用）
    if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
      bedrockArgs.skipAuth = true
      // 为 Bedrock API 密钥认证添加 Bearer 令牌
      bedrockArgs.defaultHeaders = {
        ...bedrockArgs.defaultHeaders,
        Authorization: `Bearer ${process.env.AWS_BEARER_TOKEN_BEDROCK}`,
      }
    } else if (!isEnvTruthy(process.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH)) {
      // 刷新认证并获取凭据（清除缓存）
      const cachedCredentials = await refreshAndGetAwsCredentials()
      if (cachedCredentials) {
        bedrockArgs.awsAccessKey = cachedCredentials.accessKeyId
        bedrockArgs.awsSecretKey = cachedCredentials.secretAccessKey
        bedrockArgs.awsSessionToken = cachedCredentials.sessionToken
      }
    }
    // 返回类型一直是伪装——此 SDK 不支持批处理或模型
    return new AnthropicBedrock(bedrockArgs) as unknown as Anthropic
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)) {
    const { AnthropicFoundry } = await import('@anthropic-ai/foundry-sdk')
    // 根据配置确定 Azure AD 令牌提供者
    // SDK 默认读取 ANTHROPIC_FOUNDRY_API_KEY
    let azureADTokenProvider: (() => Promise<string>) | undefined
    if (!process.env.ANTHROPIC_FOUNDRY_API_KEY) {
      if (isEnvTruthy(process.env.CLAUDE_CODE_SKIP_FOUNDRY_AUTH)) {
        // 模拟令牌提供者，用于测试/代理场景（类似于 Vertex 的模拟 GoogleAuth）
        azureADTokenProvider = () => Promise.resolve('')
      } else {
        // 使用真实的 Azure AD 认证（DefaultAzureCredential）
        const {
          DefaultAzureCredential: AzureCredential,
          getBearerTokenProvider,
        } = await import('@azure/identity')
        azureADTokenProvider = getBearerTokenProvider(
          new AzureCredential(),
          'https://cognitiveservices.azure.com/.default',
        )
      }
    }

    const foundryArgs: ConstructorParameters<typeof AnthropicFoundry>[0] = {
      ...ARGS,
      ...(azureADTokenProvider && { azureADTokenProvider }),
      ...(isDebugToStdErr() && { logger: createStderrLogger() }),
    }
    // 返回类型一直是伪装——此 SDK 不支持批处理或模型
    return new AnthropicFoundry(foundryArgs) as unknown as Anthropic
  }
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)) {
    // 如果配置了 gcpAuthRefresh 且凭据已过期，刷新 GCP 凭据
    // 这类似于我们处理 Bedrock 的 AWS 凭据刷新的方式
    if (!isEnvTruthy(process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH)) {
      await refreshGcpCredentialsIfNeeded()
    }

    const [{ AnthropicVertex }, { GoogleAuth }] = await Promise.all([
      import('@anthropic-ai/vertex-sdk'),
      loadGoogleAuthLibrary(),
    ])

    // Vertex AI 中，project-id 可通过环境变量设置。
    // google-auth-library 直接读取 GOOGLE_APPLICATION_CREDENTIALS 和 project
    // 环境变量——大多数情况下无需传递 projectId。
    // 不过，缓存需要谨慎处理：
    // - 凭据刷新/过期
    // - 环境变量变更（GOOGLE_APPLICATION_CREDENTIALS、project 变量）
    // - 跨请求认证状态管理
    // 参见：https://github.com/googleapis/google-auth-library-nodejs/issues/390 了解缓存挑战

    // 通过提供 projectId 作为后备，防止元数据服务器超时
    // google-auth-library 按以下顺序检查 project ID：
    // 1. 环境变量（GCLOUD_PROJECT、GOOGLE_CLOUD_PROJECT 等）
    // 2. 凭据文件（服务账号 JSON、ADC 文件）
    // 3. gcloud 配置
    // 4. GCE 元数据服务器（在 GCP 外会导致 12 秒超时）
    //
    // 仅在用户未配置其他发现方法时设置 projectId，
    // 以免干扰其已有的认证设置

    // 以与 google-auth-library 相同的顺序检查项目环境变量
    // 参见：https://github.com/googleapis/google-auth-library-nodejs/blob/main/src/auth/googleauth.ts
    const hasProjectEnvVar =
      process.env['GCLOUD_PROJECT'] ||
      process.env['GOOGLE_CLOUD_PROJECT'] ||
      process.env['gcloud_project'] ||
      process.env['google_cloud_project']

    // 检查凭据文件路径（服务账号或 ADC）
    // 注意：为安全起见，同时检查标准和小写变体，
    // 不过应验证 google-auth-library 实际检查的内容
    const hasKeyFile =
      process.env['GOOGLE_APPLICATION_CREDENTIALS'] ||
      process.env['google_application_credentials']

    const googleAuth = isEnvTruthy(process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH)
      ? ({
          // 模拟 GoogleAuth，用于测试/代理场景
          getClient: () => ({
            getRequestHeaders: () => ({}),
          }),
        } as VertexGoogleAuth)
      : new GoogleAuth({
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
          // 仅将 ANTHROPIC_VERTEX_PROJECT_ID 作为最后的后备
          // 这可以防止以下情况导致的 12 秒元数据服务器超时：
          // - 未设置项目环境变量 且
          // - 未指定凭据密钥文件 且
          // - ADC 文件存在但缺少 project_id 字段
          //
          // 风险：如果认证项目 != API 目标项目，可能导致计费/审计问题
          // 缓解措施：用户可以设置 GOOGLE_CLOUD_PROJECT 来覆盖
          ...(hasProjectEnvVar || hasKeyFile
            ? {}
            : {
                projectId: process.env.ANTHROPIC_VERTEX_PROJECT_ID,
              }),
        })

    const vertexArgs: ConstructorParameters<typeof AnthropicVertex>[0] = {
      ...ARGS,
      region: getVertexRegionForModel(model),
      googleAuth,
      ...(isDebugToStdErr() && { logger: createStderrLogger() }),
    }
    // 返回类型一直是伪装——此 SDK 不支持批处理或模型
    return new AnthropicVertex(vertexArgs) as unknown as Anthropic
  }

  // 根据可用的令牌确定认证方法
  const effectiveBaseURL = process.env.ANTHROPIC_BASE_URL || readCustomApiStorage().baseURL || ''
  const isLocalEndpoint = /127\.0\.0\.1|localhost/i.test(effectiveBaseURL)


  // DOGE: 诊断日志
  const diagApiKey = apiKey || getAnthropicApiKey()
  const diagAuthToken = getClaudeAIOAuthTokens()?.accessToken
  const diagIsSub = isClaudeAISubscriber()
  const hasCustomEndpoint = !!(effectiveBaseURL && !effectiveBaseURL.includes('api.anthropic.com'))
  logForDebugging(`[DOGE:auth] isSub=${diagIsSub} isLocal=${isLocalEndpoint} customEndpoint=${hasCustomEndpoint} hasApiKey=${!!diagApiKey} hasAuthToken=${!!diagAuthToken} baseURL=${effectiveBaseURL}`, { level: 'debug' })

  // DOGE: 判断是否使用自定义端点（非 Anthropic 官方 API）
  // 自定义端点包括：本地模型、公司代理、第三方 API 等
  // 对这些端点，绝对不给 OAuth authToken，只用 apiKey
  const useCustomAuth = isLocalEndpoint || hasCustomEndpoint

  const clientConfig: ConstructorParameters<typeof Anthropic>[0] = {
    // DOGE: 自定义端点 → 只用 apiKey，不给 OAuth authToken
    // 否则 SDK 同时发 x-api-key + Authorization: Bearer，自定义端点不认识后者
    apiKey: useCustomAuth
      ? diagApiKey || 'sk-ant-local-dev-placeholder'
      : isClaudeAISubscriber()
        ? null
        : diagApiKey,
    authToken: isClaudeAISubscriber() && !useCustomAuth
      ? diagAuthToken
      : void 0,
    ...(process.env.USER_TYPE === 'ant' &&
    isEnvTruthy(process.env.USE_STAGING_OAUTH)
      ? { baseURL: getOauthConfig().BASE_API_URL }
      : {}),
    ...ARGS,
  }

  if (customApiProvider === 'openai') {
    (clientConfig as ConstructorParameters<typeof Anthropic>[0] & {
      __openaiCompat?: boolean
    }).__openaiCompat = true
  }

  return new Anthropic(clientConfig)
}

function getGlobalCompatProvider(): 'anthropic' | 'openai' {
  return process.env.CLAUDE_CODE_COMPATIBLE_API_PROVIDER === 'openai'
    ? 'openai'
    : 'anthropic'
}

async function configureApiKeyHeaders(
  headers: Record<string, string>,
  isNonInteractiveSession: boolean,
): Promise<void> {
  const token =
    process.env.ANTHROPIC_AUTH_TOKEN ||
    (await getApiKeyFromApiKeyHelper(isNonInteractiveSession))
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
}

function getCustomHeaders(): Record<string, string> {
  const customHeaders: Record<string, string> = {}
  const customHeadersEnv = process.env.ANTHROPIC_CUSTOM_HEADERS

  if (!customHeadersEnv) return customHeaders

  // 按换行符分割以支持多个头字段
  const headerStrings = customHeadersEnv.split(/\n|\r\n/)

  for (const headerString of headerStrings) {
    if (!headerString.trim()) continue

    // 解析 "Name: Value" 格式的头字段（curl 风格）。在第一个 `:` 处分割
    // 然后修剪——避免对格式错误的长头行进行正则回溯。
    const colonIdx = headerString.indexOf(':')
    if (colonIdx === -1) continue
    const name = headerString.slice(0, colonIdx).trim()
    const value = headerString.slice(colonIdx + 1).trim()
    if (name) {
      customHeaders[name] = value
    }
  }

  return customHeaders
}

function createStderrLogger() {
  return {
    warn: (...args: any[]) => process.stderr.write(args.join(' ') + '\n'),
    error: (...args: any[]) => process.stderr.write(args.join(' ') + '\n'),
    info: (...args: any[]) => process.stderr.write(args.join(' ') + '\n'),
    debug: (...args: any[]) => process.stderr.write(args.join(' ') + '\n'),
  }
}

/** DOGE: 请求伪装计数器，每次重试递增以绕过供应商的「同一请求」检测 */
let disguiseCounter = 0
export function bumpDisguiseCounter(): void { disguiseCounter++ }
export function getDisguiseCounter(): number { return disguiseCounter }

function getDisguisedUserAgent(): string {
  const base = getUserAgent()
  return disguiseCounter > 0
    ? base + ` disguise/${disguiseCounter}.${Date.now().toString(36)}`
    : base
}

export const CLIENT_REQUEST_ID_HEADER = 'x-client-request-id'

function buildFetch(
  fetchOverride: ClientOptions['fetch'],
  source: string | undefined,
): ClientOptions['fetch'] {
  // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
  const inner = fetchOverride ?? globalThis.fetch
  // 仅发送给第一方 API — Bedrock/Vertex/Foundry 不记录它
  // 未知头字段可能被严格代理拒绝（inc-4029 类问题）。
  const injectClientRequestId =
    getAPIProvider() === 'firstParty' && isFirstPartyAnthropicBaseUrl()
  return (input, init) => {
    // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
    const headers = new Headers(init?.headers)
    // DOGE: 请求伪装 — 当 disguiseCounter > 0 时（即重试中），
    // 生成不同的 request ID 和 User-Agent 以绕过供应商检测
    if (disguiseCounter > 0) {
      if (injectClientRequestId) {
        headers.set(CLIENT_REQUEST_ID_HEADER, randomUUID() + '-d' + disguiseCounter)
      }
      headers.set('User-Agent', getDisguisedUserAgent())
    } else {
      // 生成客户端请求 ID，以便超时（不返回服务端请求 ID）
      // 仍可由 API 团队与服务端日志关联。
      // 希望自行跟踪 ID 的调用者可以预先设置该头字段。
      if (injectClientRequestId && !headers.has(CLIENT_REQUEST_ID_HEADER)) {
        headers.set(CLIENT_REQUEST_ID_HEADER, randomUUID())
      }
    }
    // DOGE: 请求体伪装 — 在重试时向 JSON body 注入无关字段，
    // 改变请求字节级指纹，防止供应商通过 body hash 识别为同一请求
    let bodyPatched = false
    if (disguiseCounter > 0 && init?.body && typeof init.body === 'string') {
      try {
        const parsed = JSON.parse(init.body)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // 注入一个无意义的字段（API 会忽略未知字段）
          parsed._disguise = `d${disguiseCounter}_${Date.now().toString(36)}`
          // DOGE: 对 messages 中的 content 做微小的语义无关变换，
          // 使每次重试的请求体字节序列都不同，服务器无法通过 content 指纹
          // 判断为同一请求的重复发送
          if (Array.isArray(parsed.messages)) {
            for (const msg of parsed.messages) {
              if (msg && typeof msg.content === 'string' && msg.content.length > 2) {
                const content = msg.content
                const lastChar = content[content.length - 1]
                // 如果末尾没有标点，加空格；有标点则替换为同类标点
                if (/[。！？\n\r]/.test(lastChar)) {
                  // 句尾已有句号/感叹号，替换为实现相同的不同字符
                  const variants = ['。', '！', '？', '.', '!']
                  msg.content = content.slice(0, -1) + variants[disguiseCounter % variants.length]
                } else if (/[，,；;]/.test(lastChar)) {
                  // 逗号/分号结尾，替换为其他停顿符
                  const variants = ['，', ',', '；', ';']
                  msg.content = content.slice(0, -1) + variants[disguiseCounter % variants.length]
                } else if (/\s/.test(lastChar)) {
                  // 末尾是空白，增加一个额外空格或移除
                  msg.content = disguiseCounter % 2 === 0 ? content + ' ' : content.trimEnd()
                } else {
                  // 末尾无标点无空格，追加一个空格或句号（交替）
                  msg.content = disguiseCounter % 2 === 0 ? content + ' ' : content + '。'
                }
              }
            }
          }
          // 重排 keys 顺序以改变 JSON 字节级指纹
          const reordered: Record<string, unknown> = {}
          // 先排已知字段（保持兼容性），最后放 _disguise
          const knownKeys = Object.keys(parsed).filter(k => k !== '_disguise')
          // 每次重试打乱已知字段顺序（但保持第一个字段不变以免影响路由）
          const firstKey = knownKeys[0]
          const restKeys = knownKeys.slice(1)
          for (let i = restKeys.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [restKeys[i], restKeys[j]] = [restKeys[j], restKeys[i]]
          }
          for (const k of [firstKey, ...restKeys, '_disguise']) {
            reordered[k] = parsed[k]
          }
          init.body = JSON.stringify(reordered)
          bodyPatched = true
        }
      } catch {
        // body 不是 JSON，不做处理
      }
    }
    try {
      // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
      const url = input instanceof Request ? input.url : String(input)
      const id = headers.get(CLIENT_REQUEST_ID_HEADER)
      logForDebugging(
        `[API 请求] ${new URL(url).pathname}${id ? ` ${CLIENT_REQUEST_ID_HEADER}=${id}` : ''} source=${source ?? 'unknown'}${disguiseCounter > 0 ? ` disguise#${disguiseCounter}` : ''}${bodyPatched ? ' body-patched' : ''}`,
      )
    } catch {
      // 绝不让日志导致 fetch 崩溃
    }
    return inner(input, { ...init, headers })
  }
}