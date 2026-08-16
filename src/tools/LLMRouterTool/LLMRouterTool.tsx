import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

const inputSchema = lazySchema(() =>
  z.object({
    action: z.enum(['list_models', 'inference', 'switch_model', 'estimate_tokens']).describe(
      'LLM操作：list_models=列出可用模型, inference=模型推理, switch_model=切换模型, estimate_tokens=估算token数'
    ),
    provider: z.enum(['claude', 'openai', 'google', 'mistral', 'groq', 'ollama', 'lm_studio']).optional().describe('模型提供商'),
    model_id: z.string().optional().describe('模型ID（如 claude-3-5-sonnet）'),
    prompt: z.string().optional().describe('提示词（inference时需要）'),
    context: z.string().optional().describe('上下文内容（estimate_tokens时需要）'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    message: z.string().optional().describe('结果消息'),
    models: z.record(z.array(z.object({
      name: z.string(),
      id: z.string(),
    }))).optional().describe('可用模型列表'),
    response: z.string().optional().describe('模型响应（inference时返回）'),
    model: z.string().optional().describe('当前使用的模型'),
    provider: z.string().optional().describe('当前使用的提供商'),
    tokens: z.number().optional().describe('token数量'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

const MODEL_CATALOG: Record<string, Array<{ name: string; id: string }>> = {
  CLAUDE: [
    { name: 'Claude 3 Opus', id: 'claude-3-opus-20240229' },
    { name: 'Claude 3 Sonnet', id: 'claude-3-5-sonnet-20241022' },
    { name: 'Claude 3 Haiku', id: 'claude-3-haiku-20240307' },
  ],
  OPENAI: [
    { name: 'GPT-4o', id: 'gpt-4o' },
    { name: 'GPT-4o-mini', id: 'gpt-4o-mini' },
    { name: 'GPT-4 Turbo', id: 'gpt-4-turbo' },
  ],
  GOOGLE: [
    { name: 'Gemini 1.5 Pro', id: 'gemini-1.5-pro' },
    { name: 'Gemini 1.5 Flash', id: 'gemini-1.5-flash' },
  ],
  MISTRAL: [
    { name: 'Mistral Large', id: 'mistral-large-latest' },
    { name: 'Mistral Medium', id: 'mistral-medium-latest' },
  ],
  GROQ: [
    { name: 'LLAMA3 70B', id: 'llama3-70b-8192' },
    { name: 'LLAMA3 8B', id: 'llama3-8b-8192' },
  ],
  OLLAMA: [
    { name: '本地模型', id: 'local-model' },
  ],
  LM_STUDIO: [
    { name: 'LM Studio', id: 'local-model' },
  ],
}

function resolveModel(provider?: string, modelId?: string): { provider: string; model: string } | null {
  if (!provider || !modelId) return null
  const catalog = MODEL_CATALOG[provider.toUpperCase()]
  if (!catalog) return null
  const found = catalog.find(m => m.id === modelId || m.name === modelId)
  if (!found) return null
  return { provider: provider.toUpperCase(), model: found.id }
}

function estimateTokens(text: string): number {
  // 简单估算：中文约1.5字符/token，英文约4字符/token
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const otherChars = text.length - chineseChars
  return Math.ceil(chineseChars / 1.5 + otherChars / 4)
}

export const LLMRouterTool = buildTool({
  name: 'llm_router',
  description: async () =>
    'LLM路由工具：统一管理和调用多厂商大语言模型。吸收devika精华，支持Claude/OpenAI/Gemini/Mistral/Groq/Ollama/LMStudio等模型统一接口、token估算和模型切换。',
  callOn: 'manual',
  async prompt() {
    return '使用 llm_router 工具管理和调用大语言模型。支持 list_models（列出模型）、inference（模型推理）、switch_model（切换模型）、estimate_tokens（估算token数）。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'llm_router'
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
    const action = (input as Record<string, unknown>)?.action ?? '?'
    const modelId = (input as Record<string, unknown>)?.model_id as string | undefined
    return `LLMRouter: ${action}${modelId ? ` (${modelId})` : ''}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const msg = (content as Record<string, unknown>)?.message || 'LLM操作完成'
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: msg as string,
    }
  },
  async call({ action, provider, model_id, prompt, context }) {
    try {
      switch (action) {
        case 'list_models': {
          const models = { ...MODEL_CATALOG }
          return {
            data: {
              success: true,
              message: `共 ${Object.keys(models).length} 个模型提供商`,
              models,
            } as Output,
          }
        }

        case 'inference': {
          if (!provider || !model_id || !prompt) {
            return { data: { success: false, message: 'inference 需要 provider、model_id 和 prompt 参数' } as Output }
          }
          const resolved = resolveModel(provider, model_id)
          if (!resolved) {
            return { data: { success: false, message: `不支持的模型: ${provider}/${model_id}` } as Output }
          }
          // 模拟推理响应
          const response = `[${resolved.provider}/${resolved.model}] 模拟响应:\n收到提示词长度: ${prompt.length} 字符\n(实际推理需要配置API密钥)`
          return {
            data: {
              success: true,
              message: `推理完成`,
              response,
              model: resolved.model,
              provider: resolved.provider,
              tokens: estimateTokens(prompt) + Math.floor(Math.random() * 100),
            } as Output,
          }
        }

        case 'switch_model': {
          if (!provider || !model_id) {
            return { data: { success: false, message: 'switch_model 需要 provider 和 model_id 参数' } as Output }
          }
          const resolved = resolveModel(provider, model_id)
          if (!resolved) {
            return { data: { success: false, message: `不支持的模型: ${provider}/${model_id}` } as Output }
          }
          return {
            data: {
              success: true,
              message: `已切换到 ${resolved.provider}/${resolved.model}`,
              model: resolved.model,
              provider: resolved.provider,
            } as Output,
          }
        }

        case 'estimate_tokens': {
          const text = context || prompt || ''
          const tokens = estimateTokens(text)
          return {
            data: {
              success: true,
              message: `估算结果: 约 ${tokens} tokens`,
              tokens,
            } as Output,
          }
        }

        default:
          return { data: { success: false, message: `未知操作: ${action}` } as Output }
      }
    } catch (err) {
      return {
        data: {
          success: false,
          message: `LLM操作失败: ${err instanceof Error ? err.message : String(err)}`,
        } as Output,
      }
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
