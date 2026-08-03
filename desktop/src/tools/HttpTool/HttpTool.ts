import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

const inputSchema = lazySchema(() =>
  z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']).describe('HTTP 方法'),
    url: z.string().url().describe('请求 URL'),
    headers: z.record(z.string()).optional().describe('请求标头'),
    body: z.string().optional().describe('请求体（JSON 字符串或表单数据）'),
    timeout: z.number().optional().describe('超时时间（毫秒），默认 30000'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    status: z.number().describe('响应状态码'),
    statusText: z.string().describe('状态文本'),
    headers: z.record(z.string()).describe('响应标头'),
    body: z.string().describe('响应体'),
    durationMs: z.number().optional().describe('请求耗时（毫秒）'),
    sizeBytes: z.number().optional().describe('响应体大小（字节）'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

export const HttpTool = buildTool({
  name: 'http',
  description: async () => '发送 HTTP 请求（GET/POST/PUT/DELETE/PATCH），返回完整响应',
  callOn: 'manual',
  async prompt() {
    return '使用 http 工具发送 HTTP 请求。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'http'
  },
  isEnabled() {
    return true
  },
  toAutoClassifierInput() {
    return ''
  },
  async checkPermissions(input) {
    return { behavior: 'allow', updatedInput: input }
  },
  renderToolUseMessage(input) {
    const method = (input as Record<string, unknown>)?.method ?? '?'
    const url = (input as Record<string, unknown>)?.url ?? ''
    return `HTTP ${method} ${url}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const status = (content as Record<string, unknown>).status
    const duration = (content as Record<string, unknown>).durationMs
    let msg = `HTTP ${status}`
    if (duration) msg += ` (${duration}ms)`
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: msg,
    }
  },
  async call({ method, url, headers, body, timeout = 30000 }) {
    const startTime = Date.now()
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)

      const fetchOptions: RequestInit = {
        method,
        headers: headers as Record<string, string>,
        signal: controller.signal,
      }

      if (body && !['GET', 'HEAD'].includes(method.toUpperCase())) {
        fetchOptions.body = body
      }

      const response = await fetch(url, fetchOptions)
      clearTimeout(timer)

      const responseBody = await response.text()
      const durationMs = Date.now() - startTime
      const responseHeaders: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

      return {
        data: {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: responseBody,
          durationMs,
          sizeBytes: new TextEncoder().encode(responseBody).length,
        } as Output,
      }
    } catch (err) {
      const durationMs = Date.now() - startTime
      return {
        data: {
          status: 0,
          statusText: 'Error',
          headers: {},
          body: err instanceof Error ? err.message : String(err),
          durationMs,
          sizeBytes: 0,
        } as Output,
      }
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
