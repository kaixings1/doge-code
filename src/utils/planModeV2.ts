import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { getRateLimitTier, getSubscriptionType } from './auth.js'
import { isEnvDefinedFalsy, isEnvTruthy } from './envUtils.js'

/**
 * 获取计划模式 V2 中并行代理的数量上限。
 * 环境变量优先，其次根据订阅类型和速率限制层级决定。
 */
export function getPlanModeV2AgentCount(): number {
  // 环境变量覆盖优先
  if (process.env.CLAUDE_CODE_PLAN_V2_AGENT_COUNT) {
    const count = parseInt(process.env.CLAUDE_CODE_PLAN_V2_AGENT_COUNT, 10)
    if (!isNaN(count) && count > 0 && count <= 10) {
      return count
    }
  }

  const subscriptionType = getSubscriptionType()
  const rateLimitTier = getRateLimitTier()

  // Max 订阅且具备 20 倍速率限制层级的用户可开启 3 个代理
  if (
    subscriptionType === 'max' &&
    rateLimitTier === 'default_claude_max_20x'
  ) {
    return 3
  }

  // 企业版或团队版用户可开启 3 个代理
  if (subscriptionType === 'enterprise' || subscriptionType === 'team') {
    return 3
  }

  // 其余情况默认 1 个代理
  return 1
}

/**
 * 获取计划模式 V2 探索阶段并行代理数量。
 * 优先读取环境变量，否则默认返回 3。
 */
export function getPlanModeV2ExploreAgentCount(): number {
  if (process.env.CLAUDE_CODE_PLAN_V2_EXPLORE_AGENT_COUNT) {
    const count = parseInt(
      process.env.CLAUDE_CODE_PLAN_V2_EXPLORE_AGENT_COUNT,
      10,
    )
    if (!isNaN(count) && count > 0 && count <= 10) {
      return count
    }
  }

  return 3
}

/**
 * 检查计划模式访谈阶段是否启用。
 *
 * 配置：蚂蚁用户始终启用；外部用户通过 tengu_plan_mode_interview_phase 功能开关或环境变量控制。
 */
export function isPlanModeInterviewPhaseEnabled(): boolean {
  // 蚂蚁用户始终启用
  if (process.env.USER_TYPE === 'ant') return true

  const env = process.env.CLAUDE_CODE_PLAN_MODE_INTERVIEW_PHASE
  if (isEnvTruthy(env)) return true
  if (isEnvDefinedFalsy(env)) return false

  return getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_plan_mode_interview_phase',
    false,
  )
}

/** Pewter Ledger 实验变体类型 */
export type PewterLedgerVariant = 'trim' | 'cut' | 'cap' | null

/**
 * tengu_pewter_ledger —— 计划文件结构提示词实验。
 *
 * 该实验控制五阶段计划模式工作流中第四阶段“最终计划”要点的生成方式
 * （参见 messages.ts 中的 getPlanPhase4Section）。五阶段流程占计划模式流量的 99%；
 * 访谈阶段（仅蚂蚁用户）作为参照群体保持不变。
 *
 * 实验分组：null（对照组）、'trim'、'cut'、'cap' —— 引导强度依次递增，旨在控制计划文件体积。
 *
 * 基线数据（对照组，截至 2026-03-02 的 14 天数据，样本量 N=26.3M）：
 *   中位数 4,906 字符 | 第 90 百分位 11,617 字符 | 均值 6,207 字符 | 82% 使用 Opus 4.6
 *   拒绝率与计划长度单调相关：<2K 字符时约 20%，>20K 字符时升至约 50%。
 *
 * 首要观测指标：会话级平均成本（fact__201omjcij85f）—— Opus 的输出价格是输入的 5 倍，
 * 因此成本可作为输出量的代理指标。计划长度（planLengthChars）记录于 tengu_plan_exit 事件中，
 * 是观测机制但并非最终目标 —— 'cap' 分组可能缩小计划文件体积，但通过“写入→统计→编辑”循环
 * 反而可能增加总体输出 token。
 * 护栏指标：负面反馈率、每会话请求数（计划过简可能导致更多实现迭代次数）、工具错误率。
 */
export function getPewterLedgerVariant(): PewterLedgerVariant {
  const raw = getFeatureValue_CACHED_MAY_BE_STALE<string | null>(
    'tengu_pewter_ledger',
    null,
  )
  if (raw === 'trim' || raw === 'cut' || raw === 'cap') return raw
  return null
}