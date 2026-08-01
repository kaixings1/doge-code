import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

const inputSchema = lazySchema(() =>
  z.object({
    metric: z.string().describe('指标名称'),
    value: z.number().optional().describe('指标值'),
    tags: z.record(z.string()).optional().describe('指标标签'),
  }),
)

const outputSchema = lazySchema(() =>
  z.object({
    recorded: z.boolean().describe('指标是否已记录'),
    metric: z.string().describe('指标名称'),
  }),
)

export type Output = z.infer<ReturnType<typeof outputSchema>>

// 内存指标存储
interface MetricSample {
  value: number
  timestamp: number
  tags?: Record<string, string>
}

const metricStore = new Map<string, MetricSample[]>()

function recordMetric(metric: string, value: number, tags?: Record<string, string>): void {
  const samples = metricStore.get(metric) ?? []
  samples.push({ value, timestamp: Date.now(), tags })
  if (samples.length > 1000) {
    samples.splice(0, samples.length - 1000)
  }
  metricStore.set(metric, samples)
}

function getMetricStats(metric: string): { count: number; sum: number; min: number; max: number; avg: number } | undefined {
  const samples = metricStore.get(metric)
  if (!samples || samples.length === 0) return undefined
  const values = samples.map(s => s.value)
  const sum = values.reduce((a, b) => a + b, 0)
  return {
    count: values.length,
    sum,
    min: Math.min(...values),
    max: Math.max(...values),
    avg: sum / values.length,
  }
}

export const MetricsTool = buildTool({
  name: 'metrics',
  description: async () => '收集和上报指标数据（支持计数、直方图、标签）',
  callOn: 'always',
  async prompt() {
    return '使用 metrics 工具收集和上报指标。'
  },
  get inputSchema() {
    return inputSchema()
  },
  get outputSchema() {
    return outputSchema()
  },
  userFacingName() {
    return 'metrics'
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
    const metric = (input as Record<string, unknown>)?.metric ?? '?'
    const value = (input as Record<string, unknown>)?.value
    return `Metrics: ${metric}${value !== undefined ? ` = ${value}` : ''}`
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: `Metric ${(content as Record<string, unknown>).metric} recorded`,
    }
  },
  async call({ metric, value, tags }) {
    const numericValue = value ?? 1
    recordMetric(metric, numericValue, tags)

    const stats = getMetricStats(metric)
    if (stats) {
      console.log(
        `[Metrics] ${metric}: count=${stats.count}, sum=${stats.sum.toFixed(2)}, ` +
          `min=${stats.min.toFixed(2)}, max=${stats.max.toFixed(2)}, avg=${stats.avg.toFixed(2)}`,
      )
    }

    return {
      data: {
        recorded: true,
        metric,
      } as Output,
    }
  },
} satisfies ToolDef<typeof inputSchema, Output>)
