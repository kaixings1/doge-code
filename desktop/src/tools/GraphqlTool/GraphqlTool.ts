import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

const inputSchema = lazySchema(() =>
  z.object({
    endpoint: z.string().url().describe('GraphQL 端点 URL'),
    query: z.string().describe('GraphQL 查询语句（query 或 mutation）'),
    variables: z.record(z.unknown()).optional().describe('查询变量（JSON 对象）'),
    operationName: z.string().optional().describe('操作名称（可选）'),
    headers: z.record(z.string()).optional().describe('请求标头'),
    timeout: z.number().optional().describe('超时时间（毫秒），默认 30000'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    data: z.record(z.unknown()).optional().describe('查询结果数据'),
    errors: z.array(z.record(z.unknown())).optional().describe(' 错误: GraphQL 错误列表'),
    status: z.number().describe('HTTP 状态码'),
    durationMs: z.number().optional().describe('请求耗时（毫秒）'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

export const GraphqlTool = buildTool({
  name: 'graphql',
  description: async () => '执行 GraphQL 查询和变更，返回 data 和 errors',
  callOn: 'manual',
  async prompt() {
    return '使用 graphql 工具执行 GraphQL 查询和变更。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'graphql'
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
    const query = (input as Record<string, unknown>)?.query
    return `GraphQL: ${query ? query.substring(0, 50) : '?'}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const errors = (content as Record<string, unknown>).errors
    const data = (content as Record<string, unknown>).data
    const hasErrors = errors && errors.length > 0
    const msg = hasErrors
      ? `GraphQL 错误: ${errors.map((e: any) => e.message || String(e)).join('; ')}`
      : data
        ? `查询成功，返回 ${Object.keys(data).length} 个字段`
        : '查询完成（空结果）'
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: msg,
    }
  },
  async call({ endpoint, query, variables, operationName, headers, timeout = 30000 }) {
    const startTime = Date.now()
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)

      const requestBody: Record<string, unknown> = { query }
      if (variables) requestBody.variables = variables
      if (operationName) requestBody.operationName = operationName

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(headers as Record<string, string>),
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })
      clearTimeout(timer)

      const responseBody = await response.json()
      const durationMs = Date.now() - startTime

      return {
        data: {
          data: responseBody.data,
          errors: responseBody.errors,
          status: response.status,
          durationMs,
        } as Output,
      }
    } catch (err) {
      const durationMs = Date.now() - startTime
      return {
        data: {
          data: undefined,
          errors: [{ message: err instanceof Error ? err.message : String(err) }],
          status: 0,
          durationMs,
        } as Output,
      }
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
