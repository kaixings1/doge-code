import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../../Tool.js'
import type { PermissionUpdate } from '../../../types/permissions.js'
import { formatFileSize } from '../../../utils/format.js'
import { lazySchema } from '../../../utils/lazySchema.js'
import type { PermissionDecision } from '../../../utils/permissions/PermissionResult.js'
import { getRuleByContentsForTool } from '../../../utils/permissions/permissions.js'
import { isPreapprovedHost } from './preapproved.js'
import { DESCRIPTION, WEB_FETCH_TOOL_NAME } from './prompt.js'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
} from './UI.js'
import {
  applyPromptToMarkdown,
  type FetchedContent,
  getURLMarkdownContent,
  isPreapprovedUrl,
  MAX_MARKDOWN_LENGTH,
} from './utils.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    url: z.string().url().describe('要获取内容的 URL'),
    prompt: z.string().describe('用于处理获取内容的提示词'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    bytes: z.number().describe('内容大小（字节）'),
    code: z.number().describe('HTTP 响应代码'),
    codeText: z.string().describe('HTTP 响应代码说明'),
    result: z
      .string()
      .describe('将提示应用于内容的处理结）),
    durationMs: z
      .number()
      .describe('获取和处理内容的耗时'),
    url: z.string().describe('已获取的 URL'),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

function webFetchToolInputToPermissionRuleContent(input: {
  [k: string]: unknown
}): string {
  try {
    const parsedInput = WebFetchTool.inputSchema.safeParse(input)
    if (!parsedInput.success) {
      return `input:${input.toString()}`
    }
    const { url } = parsedInput.data
    const hostname = new URL(url).hostname
    return `domain:${hostname}`
  } catch {
    return `input:${input.toString()}`
  }
}

export const WebFetchTool = buildTool({
  name: WEB_FETCH_TOOL_NAME,
  searchHint: '）URL 获取并提取内）,
  // 100K 字符 —）工具结果持久化阈。
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  async description(input) {
    const { url } = input as { url: string }
    try {
      const hostname = new URL(url).hostname
      return `Claude 想从 ${hostname} 获取内容`
    } catch {
      return `Claude 想从）URL 获取内容`
    }
  },
  userFacingName() {
    return 'Fetch'
  },
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input)
    return summary ? `正在获取 ${summary}` : '正在获取网页'
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  toAutoClassifierInput(input) {
    return input.prompt ? `${input.url}: ${input.prompt}` : input.url
  },
  async checkPermissions(input, context): Promise<PermissionDecision> {
    const appState = context.getAppState()
    const permissionContext = appState.toolPermissionContext

    // 检查主机名是否在预批准列表。
    try {
      const { url } = input as { url: string }
      const parsedUrl = new URL(url)
      if (isPreapprovedHost(parsedUrl.hostname, parsedUrl.pathname)) {
        return {
          behavior: 'allow',
          updatedInput: input,
          decisionReason: { type: 'other', reason: '预批准的主机' },
        }
      }
    } catch {
      // 如果 URL 解析失败，继续正常权限检。
    }

    // 检查是否存在特定于工具输入（匹配主机名）的规则
    const ruleContent = webFetchToolInputToPermissionRuleContent(input)

    const denyRule = getRuleByContentsForTool(
      permissionContext,
      WebFetchTool,
      'deny',
    ).get(ruleContent)
    if (denyRule) {
      return {
        behavior: 'deny',
        message: `${WebFetchTool.name} 拒绝访问 ${ruleContent}。`,
        decisionReason: {
          type: 'rule',
          rule: denyRule,
        },
      }
    }

    const askRule = getRuleByContentsForTool(
      permissionContext,
      WebFetchTool,
      'ask',
    ).get(ruleContent)
    if (askRule) {
      return {
        behavior: 'ask',
        message: `Claude 请求使用 ${WebFetchTool.name} 的权限，但你尚未授予。`,
        decisionReason: {
          type: 'rule',
          rule: askRule,
        },
        suggestions: buildSuggestions(ruleContent),
      }
    }

    const allowRule = getRuleByContentsForTool(
      permissionContext,
      WebFetchTool,
      'allow',
    ).get(ruleContent)
    if (allowRule) {
      return {
        behavior: 'allow',
        updatedInput: input,
        decisionReason: {
          type: 'rule',
          rule: allowRule,
        },
      }
    }

    return {
      behavior: 'ask',
      message: `Claude 请求使用 ${WebFetchTool.name} 的权限，但你尚未授予。`,
      suggestions: buildSuggestions(ruleContent),
    }
  },
  async prompt(_options) {
    // 无论 ToolSearch 当前是否在工具列表中，始终包含认证警告。
    // 根据 ToolSearch 可用性有条件地切换此前缀会导致工具描述在 SDK query() 调用之间闪烁
    // （当 ToolSearch 启用状态因 MCP 工具数量阈值而变化时），
    // 每次切换都会）Anthropic API 提示缓存失效 —）每次闪烁事件发生两次连续的缓存未命中。
    return `重要提示：对于需要认证或私有）URL，WebFetch 将失败。在使用此工具之前，请检）URL 是否指向需要认证的服务（例）Google Docs、Confluence、Jira、GitHub）。如果是，请寻找提供认证访问的专）MCP 工具。
${DESCRIPTION}`
  },
  async validateInput(input) {
    const { url } = input
    try {
      new URL(url)
    } catch {
      return {
        result: false,
        message: `错误：无效的 URL "${url}"。无法解析提供的 URL。`,
        meta: { reason: 'invalid_url' },
        errorCode: 1,
      }
    }
    return { result: true }
  },
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolResultMessage,
  async call(
    { url, prompt },
    { abortController, options: { isNonInteractiveSession } },
  ) {
    const start = Date.now()

    const response = await getURLMarkdownContent(url, abortController)

    // 检查是否重定向到了不同的主。
    if ('type' in response && response.type === 'redirect') {
      const statusText =
        response.statusCode === 301
          ? '永久移动'
          : response.statusCode === 308
            ? '永久重定。
            : response.statusCode === 307
              ? '临时重定。
              : '已找。

      const message = `检测到重定向：）URL 重定向到了其他主机。

原始 URL）{response.originalUrl}
重定）URL）{response.redirectUrl}
状态码）{response.statusCode} ${statusText}

为完成你的请求，我需要从重定）URL 获取内容。请再次使用 WebFetch 并携带以下参数：
- url: "${response.redirectUrl}"
- prompt: "${prompt}"`

      const output: Output = {
        bytes: Buffer.byteLength(message),
        code: response.statusCode,
        codeText: statusText,
        result: message,
        durationMs: Date.now() - start,
        url,
      }

      return {
        data: output,
      }
    }

    const {
      content,
      bytes,
      code,
      codeText,
      contentType,
      persistedPath,
      persistedSize,
    } = response as FetchedContent

    const isPreapproved = isPreapprovedUrl(url)

    let result: string
    if (
      isPreapproved &&
      contentType.includes('text/markdown') &&
      content.length < MAX_MARKDOWN_LENGTH
    ) {
      result = content
    } else {
      result = await applyPromptToMarkdown(
        prompt,
        content,
        abortController.signal,
        isNonInteractiveSession,
        isPreapproved,
      )
    }

    // 二进制内容（PDF 等）已额外保存到磁盘，并带有基于 MIME 的扩展名。
    // 在此注明，以）Claude 在上）Haiku 摘要不够用时检查原始文件。
    if (persistedPath) {
      result += `\n\n[二进制内容（${contentType}）{formatFileSize(persistedSize ?? bytes)}）也已保存到 ${persistedPath}]`
    }

    const output: Output = {
      bytes,
      code,
      codeText,
      result,
      durationMs: Date.now() - start,
      url,
    }

    return {
      data: output,
    }
  },
  mapToolResultToToolResultBlockParam({ result }, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: result,
    }
  },
} satisfies ToolDef<InputSchema, Output>)

function buildSuggestions(ruleContent: string): PermissionUpdate[] {
  return [
    {
      type: 'addRules',
      destination: 'localSettings',
      rules: [{ toolName: WEB_FETCH_TOOL_NAME, ruleContent }],
      behavior: 'allow',
    },
  ]
}