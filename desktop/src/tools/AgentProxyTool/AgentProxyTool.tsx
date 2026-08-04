// ============================================================================
// AgentProxyTool — 代理编排架构工具
// 实现 Handler 注册、链式调用、请求增强、响应拦截、统计与持久化
// ============================================================================

import type { Tool, ToolUseContext } from '../../Tool.js'
import { z } from 'zod/v4'
import { AgentProxy } from './core.js'
import { BuiltinHandlers } from './builtins.js'

// ============================================================================
// 初始化全局 AgentProxy 实例
// ============================================================================

const globalProxy = new AgentProxy()
for (const handler of BuiltinHandlers) {
  globalProxy.register(handler)
}

// ============================================================================
// Schema 定义
// ============================================================================

const AgentProxyInputSchema = z.object({
  action: z.enum(['execute', 'register', 'unregister', 'list', 'chain', 'enhance', 'intercept', 'stats', 'persist']).describe('操作类型'),
  handlerName: z.string().optional().describe('Handler 名称'),
  input: z.any().optional().describe('输入数据'),
  workflow: z.array(z.object({
    handler: z.string().describe('Handler 名称'),
    params: z.any().optional().describe('参数覆盖'),
    onError: z.enum(['stop', 'skip', 'fallback']).optional().describe('错误处理策略'),
    fallbackHandler: z.string().optional().describe('降级 Handler'),
    parallel: z.boolean().optional().describe('并行执行（同一并行组的步骤同时运行）'),
    timeout: z.number().optional().describe('超时时间（毫秒）'),
    retries: z.number().optional().describe('失败重试次数'),
    name: z.string().optional().describe('步骤名称'),
  })).optional().describe('工作流步骤定义'),
  metadata: z.record(z.any()).optional().describe('元数据（上下文注入）'),
  handlerDef: z.object({
    name: z.string(),
    description: z.string(),
    version: z.string().optional(),
  }).optional().describe('自定义 Handler 定义'),
  interceptRules: z.array(z.object({
    name: z.string(),
    code: z.number().optional(),
    transform: z.enum(['errorMap', 'wrap', 'strip']).optional(),
  })).optional().describe('拦截规则'),
})

// ============================================================================
// AgentProxyTool
// ============================================================================

export const AgentProxyTool: Tool = {
  name: 'AgentProxy',
  description: `代理编排架构工具 — Handler 注册、链式调用、请求增强、响应拦截、统计与持久化。

操作说明：
- execute: 执行单个 Handler（自动解析依赖），传入 handlerName 和 input
- register: 注册自定义 Handler（重复注册需 overwrite）
- unregister: 注销 Handler
- list: 列出所有已注册的 Handler
- chain: 执行工作链（支持并行/超时/重试/条件/降级）
- enhance: 请求增强 — 注入元数据到请求
- intercept: 响应拦截 — 统一错误码转换和处理
- stats: 查看所有 Handler 的调用统计（次数/失败率/平均耗时）
- persist: 持久化统计到磁盘

工作流步骤高级选项（chain）：
- parallel: true — 该步骤与后续 parallel 步骤并行执行
- timeout: 毫秒 — 单步超时
- retries: 次数 — 失败自动重试
- onError: stop/skip/fallback — 失败策略
- fallbackHandler: 降级 Handler 名称

内置 Handler：
- auth: 用户认证和令牌刷新（支持 DOGE_API_KEY/配置）
- dataEnrichment: 数据增强
- logging: 日志记录（写 ~/.doge/agentproxy/logs/）
- validation: 输入校验（必填/类型/正则/长度）
- errorHandling: 错误处理与统一错误码
- transform: 数据格式转换与脱敏
- rateLimit: 令牌桶限流
- git: Git 操作（status/diff/log/branch）
- file: 文件读写/列表/存在检查
- http: HTTP 请求（GET/POST/PUT/DELETE）
- codeSearch: 递归代码搜索（正则+文件类型过滤）
- deploy: 部署命令（build/test/lint/typecheck）
- notification: 通知记录
- stats: 调用统计`,

  inputSchema: AgentProxyInputSchema,

  async call(input: z.infer<typeof AgentProxyInputSchema>, ctx: ToolUseContext) {
    const { action, handlerName, input: data, workflow, metadata, handlerDef, interceptRules } = input

    try {
      switch (action) {
        case 'execute': {
          if (!handlerName) return { type: 'text', value: '❌ 缺少 handlerName 参数' }
          const result = await globalProxy.execute(handlerName, data || {}, metadata || {})
          return formatResult('执行结果', [
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

        case 'register': {
          if (!handlerDef || !handlerDef.name) return { type: 'text', value: '❌ 缺少 handlerDef 定义' }
          try {
            globalProxy.register(
              {
                name: handlerDef.name,
                description: handlerDef.description || '自定义 Handler',
                version: handlerDef.version || '1.0.0',
                tags: ['custom'],
                async handle(inputData: unknown, handlerCtx: any) {
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
            return { type: 'text', value: `✅ Handler '${handlerDef.name}' 已成功注册` }
          } catch (err) {
            return { type: 'text', value: `❌ 注册失败: ${err instanceof Error ? err.message : String(err)}` }
          }
        }

        case 'unregister': {
          if (!handlerName) return { type: 'text', value: '❌ 缺少 handlerName 参数' }
          const removed = globalProxy.registry.unregister(handlerName)
          return { type: 'text', value: removed ? `✅ Handler '${handlerName}' 已注销` : `❌ Handler '${handlerName}' 不存在` }
        }

        case 'list': {
          const handlers = globalProxy.listHandlers()
          const lines: string[] = ['# 🤖 已注册 Handler 列表\n']
          lines.push(`共 ${handlers.length} 个 Handler：\n`)
          for (const h of handlers) {
            lines.push(`## ${h.name}`)
            lines.push(`- 描述: ${h.description}`)
            lines.push(`- 版本: ${h.version}`)
            lines.push(`- 标签: ${h.tags.join(', ')}`)
            lines.push('')
          }
          return { type: 'text', value: lines.join('\n') }
        }

        case 'chain': {
          if (!workflow || workflow.length === 0) return { type: 'text', value: '❌ 缺少 workflow 定义' }

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

          const results = await chain.execute(data || {}, { metadata: metadata || {} })
          return formatChainResults(results)
        }

        case 'enhance': {
          const enhanced = globalProxy.enhance(data || {}, metadata || {})
          const lines: string[] = ['# ✨ 请求增强结果\n']
          lines.push('原始输入经过增强后，自动注入了以下元数据：')
          lines.push('')
          lines.push('```json')
          lines.push(JSON.stringify(enhanced, null, 2))
          lines.push('```')
          lines.push('')
          lines.push('### 增强说明')
          lines.push('- `_enhanced`: 标记为已增强')
          lines.push('- `_enhancedAt`: 增强时间戳')
          lines.push('- `_metadata`: 注入的上下文元数据')
          return { type: 'text', value: lines.join('\n') }
        }

        case 'intercept': {
          const mockResult = {
            success: data?.success !== false,
            data: data?.data || { message: '测试数据' },
            error: data?.error as string | void,
            code: (data?.code as number) || (data?.success !== false ? 200 : 500),
          }

          const rules = interceptRules?.map(r => ({
            name: r.name,
            condition: (res: any) => !res.success || (r.code ? res.code === r.code : false),
            transform: (res: any) => {
              if (r.transform === 'errorMap') {
                return { ...res, data: { ...res.data, _intercepted: true, _mapped: true } }
              }
              if (r.transform === 'wrap') {
                return { ...res, data: { success: res.success, data: res.data, error: res.error } }
              }
              if (r.transform === 'strip') {
                const { error, ...rest } = res
                return rest
              }
              return { ...res, intercepted: true }
            },
          })) || []

          const intercepted = globalProxy.intercept(mockResult, rules)
          const lines: string[] = ['# 🛡️ 响应拦截结果\n']
          lines.push('原始响应经过拦截处理：')
          lines.push('')
          lines.push('### 拦截前')
          lines.push('```json')
          lines.push(JSON.stringify(mockResult, null, 2))
          lines.push('```')
          lines.push('')
          lines.push('### 拦截后')
          lines.push('```json')
          lines.push(JSON.stringify(intercepted, null, 2))
          lines.push('```')
          return { type: 'text', value: lines.join('\n') }
        }

        case 'stats': {
          const stats = globalProxy.getStats()
          const entries = Object.entries(stats)
          const lines: string[] = ['# 📊 Handler 调用统计\n']
          if (entries.length === 0) {
            lines.push('（暂无调用记录）')
            return { type: 'text', value: lines.join('\n') }
          }
          lines.push(`共 ${entries.length} 个 Handler 有调用记录：\n`)
          for (const [name, s] of entries) {
            const failRate = s.calls > 0 ? ((s.failures / s.calls) * 100).toFixed(1) : '0.0'
            lines.push(`## ${name}`)
            lines.push(`- 调用次数: ${s.calls}`)
            lines.push(`- 失败次数: ${s.failures}（${failRate}%）`)
            lines.push(`- 平均耗时: ${s.avgDuration.toFixed(1)}ms`)
            lines.push(`- 最后调用: ${s.lastCalledAt || '从未'}`)
            lines.push('')
          }
          return { type: 'text', value: lines.join('\n') }
        }

        case 'persist': {
          const file = globalProxy.persist()
          const loaded = globalProxy.loadPersisted()
          return {
            type: 'text',
            value: `# 💾 状态已持久化\n\n保存位置: \`${file}\`\n\n持久化统计: ${loaded ? Object.keys(loaded).length + ' 个 Handler' : '无'}`,
          }
        }

        default:
          return { type: 'text', value: `❌ 未知操作: ${action}` }
      }
    } catch (err) {
      return { type: 'text', value: `❌ AgentProxy 错误: ${err instanceof Error ? err.message : String(err)}` }
    }
  },
}

// ============================================================================
// 辅助函数
// ============================================================================

function formatResult(title: string, lines: string[]) {
  return { type: 'text', value: `# ${title}\n${lines.filter(Boolean).join('\n')}` }
}

function formatChainResults(results: any[]) {
  const lines: string[] = ['# 🔗 工作链执行结果\n']
  lines.push(`共执行 ${results.length} 个步骤：\n`)

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    lines.push(`## 步骤 ${i + 1}: ${r.handlerName || '未知'}`)
    lines.push(`- 状态: ${r.success ? '✅ 成功' : '❌ 失败'}`)
    lines.push(`- 代码: ${r.code}`)
    if (r.error) lines.push(`- 错误: ${r.error}`)
    if (r.duration !== undefined) lines.push(`- 耗时: ${r.duration}ms`)
    lines.push('')
  }

  // 最终结果
  const lastResult = results[results.length - 1]
  if (lastResult && lastResult.success) {
    lines.push('## 📦 最终输出')
    lines.push('```json')
    lines.push(JSON.stringify(lastResult.data, null, 2))
    lines.push('```')
  }

  return { type: 'text', value: lines.join('\n') }
}
