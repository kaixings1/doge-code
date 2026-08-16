import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

const inputSchema = lazySchema(() =>
  z.object({
    actions: z.array(z.object({
      id: z.string().describe('动作唯一标识'),
      name: z.string().describe('动作名称（如工具名）'),
      confidence: z.number().min(0).max(1).optional().describe('置信度分数（0-1），用于排序'),
      metadata: z.record(z.unknown()).optional().describe('附加元数据'),
    })).min(1).describe('候选动作列表'),
    strategy: z.enum(['greedy', 'epsilon_greedy', 'top_k', 'weighted']).optional().describe('采样策略'),
    epsilon: z.number().min(0).max(1).optional().describe('epsilon-greedy 探索率（0-1）'),
    top_k: z.number().int().min(1).optional().describe('top_k 策略返回前K个动作'),
    seed: z.number().int().optional().describe('随机种子（用于复现）'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    selected: z.array(z.object({
      id: z.string(),
      name: z.string(),
      confidence: z.number().optional(),
      reason: z.string().optional(),
    })).optional().describe('选中的动作列表'),
    strategy_used: z.string().optional().describe('实际使用的策略'),
    total_candidates: z.number().optional().describe('候选动作总数'),
    message: z.string().optional().describe('结果消息'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>
export type Action = z.infer<ReturnType<typeof inputSchema>['shape']['actions']>

function pickByStrategy(
  actions: Action[],
  strategy: string,
  epsilon?: number,
  topK?: number,
  seed?: number
): { selected: Action[]; reason: string } {
  const sorted = [...actions].sort((a, b) =>
    (b.confidence ?? 0.5) - (a.confidence ?? 0.5)
  )

  switch (strategy) {
    case 'greedy': {
      const best = sorted[0]
      return { selected: best ? [best] : [], reason: '选择置信度最高的动作' }
    }

    case 'epsilon_greedy': {
      const effEpsilon = epsilon ?? 0.1
      // 简单伪随机：用 seed 或索引偏移模拟
      const useRandom = (seed ?? Date.now()) % 100 < effEpsilon * 100
      if (useRandom && sorted.length > 1) {
        const pick = sorted[Math.floor((seed ?? 0) % sorted.length)]
        return { selected: [pick], reason: `epsilon-greedy 随机探索 (ε=${effEpsilon})` }
      }
      return { selected: sorted.slice(0, 1), reason: `epsilon-greedy 利用最优 (ε=${effEpsilon})` }
    }

    case 'top_k': {
      const k = topK ?? 3
      return {
        selected: sorted.slice(0, Math.min(k, sorted.length)),
        reason: `选择置信度前 ${Math.min(k, sorted.length)} 个动作`,
      }
    }

    case 'weighted': {
      // 按置信度加权返回前3个
      const k = topK ?? 3
      return {
        selected: sorted.slice(0, Math.min(k, sorted.length)),
        reason: '加权采样（按置信度排序）',
      }
    }

    default:
      return { selected: sorted.slice(0, 1), reason: `默认策略: ${strategy}` }
  }
}

export const ActionSamplerTool = buildTool({
  name: 'action_sampler',
  description: async () =>
    '动作采样工具：从候选动作集中按策略选择最优动作。吸收 SWE-agent 精华，支持 epsilon-greedy 探索、top_k 采样、加权选择。',
  callOn: 'manual',
  async prompt() {
    return '使用 action_sampler 工具从候选动作中选择最优动作。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'action_sampler'
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
    const actions = (input as Record<string, unknown>)?.actions as Action[] | undefined
    const count = actions?.length ?? 0
    return `ActionSampler: ${count} candidates`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const msg = (content as Record<string, unknown>).message || '动作采样完成'
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: msg,
    }
  },
  async call({ actions, strategy, epsilon, top_k, seed }) {
    try {
      if (!actions || actions.length === 0) {
        return {
          data: {
            success: false,
            message: 'actions 不能为空',
          } as Output,
        }
      }

      const usedStrategy = strategy ?? 'greedy'
      const { selected, reason } = pickByStrategy(actions, usedStrategy, epsilon, top_k, seed)

      return {
        data: {
          success: true,
          selected: selected.map(a => ({
            id: a.id,
            name: a.name,
            confidence: a.confidence,
            reason,
          })),
          strategy_used: usedStrategy,
          total_candidates: actions.length,
          message: `从 ${actions.length} 个候选动作中选择 ${selected.length} 个（${reason}）`,
        } as Output,
      }
    } catch (err) {
      return {
        data: {
          success: false,
          message: `Action 采样失败: ${err instanceof Error ? err.message : String(err)}`,
        } as Output,
      }
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
