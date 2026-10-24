/**
 * 分层模型路由（Tiered Model Routing）
 *
 * 思路吸收自 ClawRouter 的「按任务复杂度分流 + 请求去重 + 花费预估」，
 * 但去掉全部加密货币/钱包/微支付依赖：这里只做纯本地决策。
 *
 * 三层：
 *   cheap    — 小模型（Haiku 级）：简单改动、单文件问答、格式转换
 *   standard — 中模型（Sonnet 级）：常规实现、多文件修改
 *   strong   — 大模型（Opus 级）：架构设计、疑难调试、跨模块重构
 *
 * 用途：
 *   1. /router  命令给出当前会话的成本建议与分层收益估算
 *   2. 供工具链/脚本调用 classify() 得到一次任务的建议层级
 *
 * 纯函数、无网络、无副作用（去重模块除外，见 RequestDeduper）。
 */

export type RouteTier = 'cheap' | 'standard' | 'strong'

export interface TierSpec {
  tier: RouteTier
  label: string
  /** 相对 strong 层的近似成本倍率，仅用于估算，不用于计费 */
  costFactor: number
  /** 典型适用场景，展示用 */
  examples: string[]
}

export const TIERS: Record<RouteTier, TierSpec> = {
  cheap: {
    tier: 'cheap',
    label: '小模型（Haiku 级）',
    costFactor: 0.08,
    examples: ['单文件小改动', '格式转换', '简单的 grep/读文件问答', '文案与注释润色'],
  },
  standard: {
    tier: 'standard',
    label: '中模型（Sonnet 级）',
    costFactor: 0.3,
    examples: ['常规功能实现', '多文件修改', '写测试', '常规 bug 修复'],
  },
  strong: {
    tier: 'strong',
    label: '大模型（Opus 级）',
    costFactor: 1,
    examples: ['架构设计', '跨模块重构', '疑难并发/性能问题', '安全审计'],
  },
}

export interface ClassifyInput {
  /** 任务描述或用户消息 */
  text: string
  /** 附加的上下文规模（估算 token），默认 0 */
  contextTokens?: number
  /** 是否明确要求高质量 */
  requireStrong?: boolean
}

export interface ClassifyResult {
  tier: RouteTier
  score: number
  reasons: string[]
}

/** 强信号：一旦命中，直接升到 strong，不再看分数。 */
const STRONG_PATTERNS: Array<[RegExp, string]> = [
  [/架构|重构|设计模式|整体方案|architecture|refactor/i, '涉及架构或重构'],
  [/并发|死锁|竞态|竞态条件|内存泄漏|race condition|deadlock|leak/i, '涉及并发/内存疑难'],
  [/性能|优化到|benchmark|profiling|O\(n\^?2\)/i, '涉及性能分析'],
  [/安全|漏洞|注入|越权|security|vulnerability|xss|csrf/i, '涉及安全'],
  [/跨模块|多模块|全仓|整个项目|codebase-wide/i, '涉及跨模块改动'],
  [/为什么.*(不|没).*(工作|生效|显示)|排查|根因|root cause/i, '需要根因排查'],
]

/** 弱信号：累计分数，达到阈值升一级。 */
const WEAK_PATTERNS: Array<[RegExp, number, string]> = [
  [/测试|単測|test|spec/i, 1, '涉及测试'],
  [/多个文件|三个文件以上|several files/i, 1, '涉及多文件'],
  [/实现|新增|添加|implement|add feature/i, 1, '涉及功能实现'],
  [/修复|bug|报错|异常|error|exception/i, 1, '涉及缺陷修复'],
  [/格式|重命名|改名|注释|format|rename|comment/i, -2, '任务偏机械'],
  [/解释|说明|什么是|how does|explain/i, -2, '任务是解释性的'],
]

const STRONG_THRESHOLD = 4
const CHEAP_THRESHOLD = 0

export function classify(input: ClassifyInput): ClassifyResult {
  const text = input.text ?? ''
  const reasons: string[] = []

  if (input.requireStrong) {
    return { tier: 'strong', score: 100, reasons: ['显式要求高质量模型'] }
  }

  for (const [re, why] of STRONG_PATTERNS) {
    if (re.test(text)) {
      return { tier: 'strong', score: 100, reasons: [why] }
    }
  }

  let score = 0
  for (const [re, weight, why] of WEAK_PATTERNS) {
    if (re.test(text)) {
      score += weight
      reasons.push(`${why}(${weight > 0 ? '+' : ''}${weight})`)
    }
  }

  // 上下文越长，越倾向用能处理长上下文的强模型
  const ctx = input.contextTokens ?? 0
  if (ctx > 60_000) {
    score += 1
    reasons.push('上下文规模较大(+1)')
  }

  const tier: RouteTier = score >= STRONG_THRESHOLD ? 'standard' : score <= CHEAP_THRESHOLD ? 'cheap' : 'standard'
  return { tier, score, reasons }
}

export interface EstimateInput {
  requests: number
  /** 当前实际总花费（USD），未知则传 undefined */
  currentCostUSD?: number
}

export interface EstimateRow {
  tier: RouteTier
  label: string
  estimatedCostUSD: number
  savingsVsStrong: number
}

/**
 * 估算：如果把全部请求都交给某一层，总花费大概是多少。
 * 以当前实际花费为锚点，乘以层级倍率；没有实际花费时返回各层相对占比（按 1 USD 基准）。
 */
export function estimateTiers(input: EstimateInput): EstimateRow[] {
  const anchor = input.currentCostUSD && input.currentCostUSD > 0 ? input.currentCostUSD : 1
  return (Object.keys(TIERS) as RouteTier[]).map(t => {
    const spec = TIERS[t]
    const cost = anchor * spec.costFactor
    return {
      tier: t,
      label: spec.label,
      estimatedCostUSD: cost,
      savingsVsStrong: anchor - cost,
    }
  })
}

/**
 * 简单请求去重器（借鉴 ClawRouter 的 dedup 思路）。
 *
 * 场景：同一会话因为超时/重试，可能对完全相同的 prompt 发起多次请求。
 * 这里记录「进行中」与「最近已完成」的请求指纹，让调用方能在重试前判断
 * 是否可以直接复用结果，避免重复计费。
 *
 * 约束（有意为之的简化）：单进程内存态，不跨进程；TTL 默认 30s。
 */
export class RequestDeduper {
  private inflight = new Map<string, Promise<unknown>>()
  private completed = new Map<string, { result: unknown; at: number }>()
  private readonly ttlMs: number

  constructor(ttlMs = 30_000) {
    this.ttlMs = ttlMs
  }

  /** 指纹：任务文本 + 模型 + 关键参数，稳定序列化后取短哈希等价物。 */
  static fingerprint(parts: {
    text: string
    model?: string
    extra?: Record<string, unknown>
  }): string {
    const extra = parts.extra ? stableStringify(parts.extra) : ''
    return `${parts.model ?? '-'}\u0000${parts.text}\u0000${extra}`
  }

  /** 已完成的、仍在 TTL 内的相同请求结果；没有则 undefined。 */
  getCached(key: string): unknown | undefined {
    this.evict()
    return this.completed.get(key)?.result
  }

  /** 若已有相同请求在执行，返回同一个 Promise（调用方共享结果）。 */
  getInflight(key: string): Promise<unknown> | undefined {
    return this.inflight.get(key)
  }

  /** 执行并登记；相同 key 并发调用只会真正执行一次。 */
  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const cached = this.getCached(key)
    if (cached !== undefined) return cached as T

    const existing = this.inflight.get(key)
    if (existing) return existing as Promise<T>

    const p = (async () => {
      try {
        const result = await fn()
        this.completed.set(key, { result, at: Date.now() })
        return result
      } finally {
        this.inflight.delete(key)
      }
    })()

    this.inflight.set(key, p)
    return p
  }

  clear(): void {
    this.inflight.clear()
    this.completed.clear()
  }

  get size(): number {
    this.evict()
    return this.completed.size
  }

  private evict(): void {
    const now = Date.now()
    for (const [k, v] of this.completed) {
      if (now - v.at > this.ttlMs) this.completed.delete(k)
    }
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}
