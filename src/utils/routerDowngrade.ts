/**
 * Tiered downgrade — `/router` 的自动降级决策层
 *
 * 与 utils/modelRouter.ts 的分工：
 *   - modelRouter.classify()  判断任务「该用什么档位」（建议）
 *   - 本模块决定「这一次请求到底要不要真的降级」（执行）
 *
 * 安全原则（必须显式开启）：
 *   1. 默认关闭 —— 未设置 CLAUDE_CODE_ROUTER_AUTO 时永远不降级
 *   2. 只降级、不升级 —— 永不把用户选的模型换成更贵的
 *   3. 只降一级 —— strong→standard 或 standard→cheap，不做两连跳
 *   4. 计划模式不降级 —— plan 模式需要最强推理
 *   5. 含图片不降级 —— 视觉能力由 visionModelRouter 单独处理，避免互相打架
 *   6. 上下文过大不降级 —— 小模型上下文窗口装不下
 *   7. 只替换「已知是同族」的模型 —— 自定义模型名/中转站自定义 ID 一律不动
 */

import { classify, type RouteTier } from '../utils/modelRouter.js'

/** 环境变量：开启自动降级（'1' / 'true' 才算开启）。 */
export const ROUTER_AUTO_ENV = 'CLAUDE_CODE_ROUTER_AUTO'
/** 环境变量：空跑模式，只记录"将会降级"但不实际改模型。 */
export const ROUTER_DRY_RUN_ENV = 'CLAUDE_CODE_ROUTER_DRY_RUN'
/** 环境变量：打印降级决策日志（未降级原因也会打印）。 */
export const ROUTER_DEBUG_ENV = 'CLAUDE_CODE_ROUTER_DEBUG'
/** 环境变量：小模型对应的模型名覆盖。 */
export const ROUTER_CHEAP_MODEL_ENV = 'CLAUDE_CODE_ROUTER_CHEAP_MODEL'
/** 环境变量：中模型对应的模型名覆盖。 */
export const ROUTER_STANDARD_MODEL_ENV = 'CLAUDE_CODE_ROUTER_STANDARD_MODEL'

/** 超过这个 token 估算就不降级（小模型上下文窗口通常装不下）。 */
export const DOWNGRADE_CONTEXT_LIMIT_TOKENS = 60_000

function isTruthy(v: string | undefined): boolean {
  if (!v) return false
  const s = v.trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'yes' || s === 'on'
}

/** 是否打印降级决策日志（含未降级原因）。 */
export function isRouterDebugEnabled(): boolean {
  return isTruthy(process.env[ROUTER_DEBUG_ENV])
}

export interface DowngradeDecision {
  /** 实际要用的模型（未降级时等于入参 model） */
  model: string
  /** 是否（将要）降级 */
  downgraded: boolean
  /** 未降级原因；降级时为 undefined */
  reason?: string
  /** 分类得到的档位（未运行时为 undefined） */
  tier?: RouteTier
  /** 降级目标档位 */
  targetTier?: RouteTier
}

/** 模型名 → 档位。识别不出返回 undefined（视为自定义模型，不参与降级）。 */
export function tierOfModel(model: string): RouteTier | undefined {
  const m = model.toLowerCase()
  if (/opus/.test(m)) return 'strong'
  if (/haiku|small|mini|flash/.test(m)) return 'cheap'
  if (/sonnet|gpt-4|gemini-[23]/.test(m)) return 'standard'
  return undefined
}

const TIER_ORDER: RouteTier[] = ['cheap', 'standard', 'strong']

/**
 * 取得目标档位对应的模型名。
 *
 * 优先环境变量覆盖 → 模型族默认值 → 模型族别名兜底。
 * 别名（haiku / sonnet）本身是合法模型设置，会被 parseUserSpecifiedModel
 * 解析成真实模型，因此这条兜底在纯 ESM 运行时（require 不可用）也能工作。
 */
export function modelForTier(tier: RouteTier): string | undefined {
  const envOverride =
    tier === 'cheap'
      ? process.env[ROUTER_CHEAP_MODEL_ENV]
      : tier === 'standard'
        ? process.env[ROUTER_STANDARD_MODEL_ENV]
        : undefined
  if (envOverride?.trim()) return envOverride.trim()

  // 别名兜底：尊重 ANTHROPIC_DEFAULT_*_MODEL，与 model.js 的优先级保持一致
  const alias =
    tier === 'cheap'
      ? process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || 'haiku'
      : process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || 'sonnet'

  try {
    // 延迟 require：model.js 会读配置/环境，导入即产生副作用
    const mod = require('../utils/model/model.js') as {
      getSmallFastModel?: () => string
      getDefaultSonnetModel?: () => string
    }
    const resolved = tier === 'cheap' ? mod.getSmallFastModel?.() : mod.getDefaultSonnetModel?.()
    if (resolved?.trim()) return resolved.trim()
  } catch {
    // require 在纯 ESM 运行时（vitest）不可用，走别名兜底
  }

  return alias
}

export interface DecideInput {
  /** 当前会话模型（用户选的，可能含 [1m] 后缀） */
  model: string
  /** 本轮用户输入文本，用于分类 */
  taskText?: string
  /** 上下文 token 估算 */
  contextTokens?: number
  /** 当前权限模式 */
  permissionMode?: string
  /** 本轮是否含图片 */
  hasImages?: boolean
  /** 环境变量视图（测试注入用） */
  env?: Record<string, string | undefined>
}

/**
 * 决定本轮是否降级。
 *
 * 返回的 model 不做 [1m] 后缀的隐式增删 —— 降级目标就是它自己的默认形态。
 */
export function decideDowngrade(input: DecideInput): DowngradeDecision {
  const env = input.env ?? process.env
  const base = input.model

  if (!isTruthy(env[ROUTER_AUTO_ENV])) {
    return { model: base, downgraded: false, reason: `${ROUTER_AUTO_ENV} 未开启` }
  }

  if (input.permissionMode === 'plan') {
    return { model: base, downgraded: false, reason: '计划模式下不降级' }
  }

  if (input.hasImages) {
    return { model: base, downgraded: false, reason: '含图片，交给视觉路由处理' }
  }

  if ((input.contextTokens ?? 0) > DOWNGRADE_CONTEXT_LIMIT_TOKENS) {
    return { model: base, downgraded: false, reason: '上下文过大' }
  }

  const currentTier = tierOfModel(base)
  if (!currentTier) {
    return { model: base, downgraded: false, reason: '当前模型非已知模型族，不参与降级' }
  }
  if (currentTier === 'cheap') {
    return { model: base, downgraded: false, reason: '已在最低档' }
  }

  const taskText = input.taskText?.trim()
  if (!taskText) {
    return { model: base, downgraded: false, reason: '无任务文本可分类' }
  }

  const { tier: needed, score, reasons } = classify({ text: taskText, contextTokens: input.contextTokens })

  // 只降一级：strong → standard → cheap
  const currentIdx = TIER_ORDER.indexOf(currentTier)
  const targetIdx = Math.max(0, currentIdx - 1)
  const targetTier = TIER_ORDER[targetIdx]

  // 任务需要的档位高于目标档位时，不降级
  if (TIER_ORDER.indexOf(needed) > targetIdx) {
    return {
      model: base,
      downgraded: false,
      reason: `任务需要 ${needed}（评分 ${score}: ${reasons.join('；') || '无特征'}），不降到 ${targetTier}`,
      tier: needed,
    }
  }

  const targetModel = modelForTier(targetTier)
  if (!targetModel) {
    return { model: base, downgraded: false, reason: `取不到 ${targetTier} 档模型`, tier: needed }
  }

  // 目标模型必须与当前模型不同族（否则等于没换）
  if (tierOfModel(targetModel) === currentTier) {
    return { model: base, downgraded: false, reason: '目标模型与当前同档，跳过', tier: needed }
  }

  if (isTruthy(env[ROUTER_DRY_RUN_ENV])) {
    return {
      model: base,
      downgraded: false,
      reason: `[空跑] 本会降级到 ${targetModel}`,
      tier: needed,
      targetTier,
    }
  }

  return { model: targetModel, downgraded: true, tier: needed, targetTier }
}

