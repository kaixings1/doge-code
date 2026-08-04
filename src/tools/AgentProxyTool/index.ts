// ============================================================================
// AgentProxyTool (CLI 版) — 代理编排架构工具
// 复用 core.ts/builtins.ts，适配 CLI 端 Tool 接口
// ============================================================================

import type { Tool, ToolResult } from '../../Tool.js'
import { z } from 'zod/v4'
import { AgentProxy, type HandlerResult, type InterceptRule, type WorkflowStep } from './core.js'
import { BuiltinHandlers } from './builtins.js'

const globalProxy = new AgentProxy()
for (const handler of BuiltinHandlers) {
  globalProxy.register(handler)
}

/** 内置 Handler 名称集合（受保护，不允许被 register 覆盖） */
const BUILTIN_HANDLER_NAMES = new Set(BuiltinHandlers.map((h) => h.name))

/** 合法 action 枚举 */
const VALID_ACTIONS = ['execute', 'register', 'unregister', 'list', 'chain', 'enhance', 'intercept', 'stats', 'persist']

export class AgentProxyTool implements Tool {
  name = 'agent_proxy'
  /** CLI 工具必需方法 */
  isEnabled = () => true
  isReadOnly = (_input?: unknown) => false
  isDestructive = (_input?: unknown) => false
  isConcurrencySafe = (_input?: unknown) => false
  prompt = async (_options?: unknown) => this.descriptionText
  userFacingName = () => this.name
  maxResultSizeChars = 10000

  /** 标准工具元信息（用于 LLM 工具列表生成、权限检查、MCP 注册） */
  info(): { name: string; description: string; parameters: Record<string, unknown>; required: string[] } {
    return { name: this.name, description: this.descriptionText, parameters: this.parameters, required: ['action'] }
  }

  checkPermissions = async (input: Record<string, unknown>) => ({
    behavior: 'allow' as const,
    updatedInput: input,
  })

  toAutoClassifierInput = (_input?: unknown) => ''

  renderToolUseMessage = (_input?: unknown, _options?: unknown) => null

  // CLI 工具输入 schema：复用已有的 JSON Schema（inputJSONSchema 优先于 inputSchema 用于模型工具定义）
  get inputJSONSchema() {
    return this.parameters as Tool['inputJSONSchema']
  }
  get inputSchema() {
    return z.object({}).passthrough()
  }

  descriptionText = `代理编排架构工具 — Handler 注册、链式调用、请求增强、响应拦截、统计与持久化。
操作: execute(执行Handler,自动解析依赖) / register(注册自定义Handler) / unregister(注销) / list(列出) / chain(工作链,支持并行/超时/重试/降级) / enhance(请求增强) / intercept(响应拦截) / stats(调用统计) / persist(持久化)。
内置Handler: auth(认证,支持DOGE_API_KEY) / dataEnrichment(数据增强) / logging(日志) / validation(校验) / errorHandling(错误码) / transform(转换脱敏) / rateLimit(令牌桶限流) / git(状态/diff/log) / file(读写/列表) / http(HTTP请求) / codeSearch(代码搜索) / deploy(build/test/lint) / notification(通知) / stats(统计)`

  async description(_input?: unknown, _options?: unknown): Promise<string> {
    return this.descriptionText
  }

  /** 将工具 data 结果映射为 tool_result block（供 CLI 展示） */
  mapToolResultToToolResultBlockParam(content: unknown, toolUseID: string) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content:
        (content as { text?: string } | null)?.text ||
        (typeof content === 'string' ? content : JSON.stringify(content, null, 2)),
    }
  }

  /** CLI 工具调用入口：委托给 execute 并解包文本输出 */
  async call(input: Record<string, unknown>): Promise<ToolResult<{ text: string }>> {
    const result = await this.execute(input)
    const blocks = Array.isArray(result.content) ? (result.content as { type?: string; text?: string }[]) : []
    const text = blocks.map((b) => b.text).filter(Boolean).join('\n') || String(result.content ?? '')
    return { data: { text } }
  }

  parameters = {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        enum: ['execute', 'register', 'unregister', 'list', 'chain', 'enhance', 'intercept', 'stats', 'persist'],
        description: '操作类型',
      },
      handlerName: { type: 'string', description: 'Handler 名称' },
      input: { type: 'object', description: '输入数据' },
      workflow: {
        type: 'array',
        description: '工作流步骤定义',
        items: {
          type: 'object',
          properties: {
            handler: { type: 'string', description: 'Handler 名称' },
            params: { type: 'object', description: '参数覆盖' },
            onError: { type: 'string', enum: ['stop', 'skip', 'fallback'], description: '失败策略' },
            fallbackHandler: { type: 'string', description: '降级 Handler' },
            parallel: { type: 'boolean', description: '并行执行' },
            timeout: { type: 'number', description: '超时毫秒' },
            retries: { type: 'number', description: '重试次数' },
            name: { type: 'string', description: '步骤名称' },
          },
        },
      },
      metadata: { type: 'object', description: '元数据（上下文注入）' },
      handlerDef: {
        type: 'object',
        description: '自定义 Handler 定义',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          version: { type: 'string' },
        },
      },
      interceptRules: {
        type: 'array',
        description: '拦截规则',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            code: { type: 'number' },
            transform: { type: 'string', enum: ['errorMap', 'wrap', 'strip'] },
          },
        },
      },
    },
    required: ['action'],
  }

  validate = (params: unknown) => {
    const p = (params || {}) as Record<string, unknown>
    if (!p.action || typeof p.action !== 'string') {
      return { valid: false, errors: ['缺少 action 参数'] }
    }
    if (!VALID_ACTIONS.includes(p.action)) {
      return { valid: false, errors: [`未知 action: ${p.action}，合法值: ${VALID_ACTIONS.join(' / ')}`] }
    }
    return { valid: true }
  }

  execute = async (params: unknown) => {
    const p = (params || {}) as Record<string, unknown>
    const action = p.action as string
    const handlerName = p.handlerName as string | undefined
    const data = (p.input as Record<string, unknown>) || {}
    const workflow = (p.workflow as WorkflowStep[] | undefined) || []
    const metadata = (p.metadata as Record<string, unknown>) || {}
    const handlerDef = p.handlerDef as { name?: string; description?: string; version?: string } | undefined
    const interceptRules = p.interceptRules as { name?: string; code?: number; transform?: string }[] | undefined

    try {
      let text = ''
      switch (action) {
        case 'execute': {
          if (!handlerName) text = '❌ 缺少 handlerName 参数'
          else {
            const result = await globalProxy.execute(handlerName, data, metadata)
            text = formatResult('执行结果', [
              `Handler: ${handlerName}`,
              `状态: ${result.success ? '✅ 成功' : '❌ 失败'}`,
              `代码: ${result.code}`,
              result.error ? `错误: ${result.error}` : '',
              result.duration !== undefined ? `耗时: ${result.duration}ms` : '',
              '',
              '## 输出数据',
              '```json',
              JSON.stringify(result.data, null, 2),
              '```',
            ])
          }
          break
        }

        case 'register': {
          if (!handlerDef || !handlerDef.name) {
            text = '❌ 缺少 handlerDef 定义'
            break
          }
          if (BUILTIN_HANDLER_NAMES.has(handlerDef.name)) {
            text = `❌ 不允许覆盖内置 Handler '${handlerDef.name}'（内置 Handler 受保护）`
            break
          }
          try {
            globalProxy.register(
              {
                name: handlerDef.name,
                description: handlerDef.description || '自定义 Handler',
                version: handlerDef.version || '1.0.0',
                tags: ['custom'],
                async handle(inputData: unknown, handlerCtx: { requestId: string }) {
                  return {
                    success: true,
                    data: {
                      _handlerName: handlerDef.name,
                      _input: inputData,
                      _requestId: handlerCtx.requestId,
                      _processedAt: new Date().toISOString(),
                    },
                    code: 200,
                  }
                },
              },
              { overwrite: true },
            )
            text = `✅ Handler '${handlerDef.name}' 已成功注册`
          } catch (err) {
            text = `❌ 注册失败: ${err instanceof Error ? err.message : String(err)}`
          }
          break
        }

        case 'unregister': {
          if (!handlerName) text = '❌ 缺少 handlerName 参数'
          else {
            const removed = globalProxy.registry.unregister(handlerName)
            text = removed ? `✅ Handler '${handlerName}' 已注销` : `❌ Handler '${handlerName}' 不存在`
          }
          break
        }

        case 'list': {
          const handlers = globalProxy.listHandlers()
          const lines = ['# 🤖 已注册 Handler 列表', '', `共 ${handlers.length} 个 Handler：`, '']
          for (const h of handlers) {
            lines.push(`## ${h.name}`, `- 描述: ${h.description}`, `- 版本: ${h.version}`, `- 标签: ${h.tags.join(', ')}`, '')
          }
          text = lines.join('\n')
          break
        }

        case 'chain': {
          if (workflow.length === 0) {
            text = '❌ 缺少 workflow 定义'
            break
          }
          const chain = globalProxy.createChain()
          for (const step of workflow) {
            chain.addStep({
              handler: step.handler,
              params: step.params,
              onError: step.onError,
              fallbackHandler: step.fallbackHandler,
              parallel: step.parallel,
              timeout: step.timeout,
              retries: step.retries,
              name: step.name,
            })
          }
          const results = await chain.execute(data, { metadata })
          text = formatChainResults(results)
          break
        }

        case 'enhance': {
          const enhanced = globalProxy.enhance(data, metadata)
          const lines = ['# ✨ 请求增强结果', '', '原始输入经过增强后，自动注入了以下元数据：', '', '```json', JSON.stringify(enhanced, null, 2), '```', '']
          text = lines.join('\n')
          break
        }

        case 'intercept': {
          const mockResult: HandlerResult = {
            success: data.success !== false,
            data: data.data || { message: '测试数据' },
            code: (data.code as number) || (data.success !== false ? 200 : 500),
          }
          if (typeof data.error === 'string') mockResult.error = data.error
          const rules: InterceptRule[] = (interceptRules || []).map((r) => ({
            name: r.name || 'rule',
            condition: (res: HandlerResult) => !res.success || (r.code ? res.code === r.code : false),
            transform: (res: HandlerResult): HandlerResult => {
              if (r.transform === 'errorMap') return { ...res, data: { ...(res.data as object), _intercepted: true, _mapped: true } }
              if (r.transform === 'wrap') return { ...res, data: { success: res.success, data: res.data, error: res.error } }
              if (r.transform === 'strip') {
                const { error: _err, ...rest } = res
                return rest as HandlerResult
              }
              return { ...res, intercepted: true }
            },
          }))
          const intercepted = globalProxy.intercept(mockResult, rules)
          const lines = [
            '# 🛡️ 响应拦截结果',
            '',
            '### 拦截前',
            '```json',
            JSON.stringify(mockResult, null, 2),
            '```',
            '',
            '### 拦截后',
            '```json',
            JSON.stringify(intercepted, null, 2),
            '```',
          ]
          text = lines.join('\n')
          break
        }

        case 'stats': {
          const stats = globalProxy.getStats()
          const entries = Object.entries(stats)
          const lines = ['# 📊 Handler 调用统计', '']
          if (entries.length === 0) {
            lines.push('（暂无调用记录）')
          } else {
            lines.push(`共 ${entries.length} 个 Handler 有调用记录：`, '')
            for (const [name, s] of entries) {
              const failRate = s.calls > 0 ? ((s.failures / s.calls) * 100).toFixed(1) : '0.0'
              lines.push(`## ${name}`, `- 调用次数: ${s.calls}`, `- 失败次数: ${s.failures}（${failRate}%）`, `- 平均耗时: ${s.avgDuration.toFixed(1)}ms`, `- 最后调用: ${s.lastCalledAt || '从未'}`, '')
            }
          }
          text = lines.join('\n')
          break
        }

        case 'persist': {
          const file = globalProxy.persist()
          text = `# 💾 状态已持久化\n\n保存位置: \`${file}\``
          break
        }

        default:
          text = `❌ 未知操作: ${action}`
      }

      return { content: [{ type: 'text', text }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ AgentProxy 错误: ${err instanceof Error ? err.message : String(err)}` }] }
    }
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

function formatResult(title: string, lines: string[]) {
  return `# ${title}\n${lines.filter(Boolean).join('\n')}`
}

function formatChainResults(results: { handlerName?: string; success: boolean; code: number; error?: string; duration?: number; data: unknown }[]) {
  const lines = ['# 🔗 工作链执行结果', '', `共执行 ${results.length} 个步骤：`, '']
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    lines.push(`## 步骤 ${i + 1}: ${r.handlerName || '未知'}`, `- 状态: ${r.success ? '✅ 成功' : '❌ 失败'}`, `- 代码: ${r.code}`)
    if (r.error) lines.push(`- 错误: ${r.error}`)
    if (r.duration !== undefined) lines.push(`- 耗时: ${r.duration}ms`)
    lines.push('')
  }
  const lastResult = results[results.length - 1]
  if (lastResult && lastResult.success) {
    lines.push('## 📦 最终输出', '```json', JSON.stringify(lastResult.data, null, 2), '```')
  }
  return lines.join('\n')
}
