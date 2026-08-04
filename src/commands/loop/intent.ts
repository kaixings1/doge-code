/**
 * Loop Intent Detector
 *
 * 循环意图解析器 — 从聊天自然语言中捕获循环引擎调用指令。
 *
 * 支持的中文模式（示例）：
 *   - "直到服务器能跑通，你自己利用 bash 反复测试，直到返回 200"
 *   - "循环执行：编写代码 → 运行测试 → 修复，直到所有测试通过"
 *   - "迭代优化这个函数，直至性能达标"
 *   - "反复检查日志，直到错误消失为止"
 *
 * 解析结果：
 *   - goal         循环目标（去掉"直到/直至"条件子句后的主体）
 *   - criteria     每个"直到 X / 直至 X / 循环到 X"子句 → 成功标准
 *   - toolHints    从"利用/使用/调用 X"子句中提取的工具提示
 *   - strategyHint 关键词 → 策略映射（复用 autoSelectStrategy 思路）
 */

import type { LoopStrategyName } from './types.js'

export interface LoopIntent {
  /** 循环目标（主体任务描述） */
  goal: string
  /** 成功标准（每个"直到 X"子句） */
  criteria: string[]
  /** 工具提示（"利用/使用/调用 X"提取的可用工具） */
  toolHints: string[]
  /** 策略提示（由关键词推断，可为空） */
  strategyHint: LoopStrategyName | null
  /** 原始输入 */
  raw: string
}

/**
 * 循环意图触发词 — 命中任意一个即视为"可能是循环指令"
 */
const TRIGGER_PATTERNS = [
  /直到/,
  /直至/,
  /为止/,
  /循环/,
  /反复/,
  /迭代/,
  /不断/,
  /重复/,
  /持续/,
  /while\s/,
  /until\s/,
  /keep\s+(?:going|trying|doing)/i,
  /repeat\s+(?:until|till)/i,
  /loop\s+until/i,
]

/**
 * 条件子句提取 — "直到 X，直至 Y，循环到 Z"
 */
const CONDITION_PATTERNS = [
  /直到([^，。；,;]+)/g,
  /直至([^，。；,;]+)/g,
  /一直(?:到|至)([^，。；,;]+)/g,
  /循环(?:到|至)([^，。；,;]+)/g,
  /循环执行[^，。；,;]*直到([^，。；,;]+)/g,
  /until\s+([^.,;]+)/gi,
  /till\s+([^.,;]+)/gi,
  /until\s+([^.,;]+?)(?=,|\.|;|$)/gi,
]

/**
 * 工具子句提取 — "利用 X / 使用 X 工具 / 调用 X / 用 X"
 * X 为工具名：英文（bash、curl、grep…）或中文（命令行、脚本…）。
 * 注意：后缀不能贪心，避免误吞动词核心词（如"利用 bash 反复测试"的"测试"）。
 */
const TOOL_PATTERNS = [
  /(?:利用|使用|调用|借助|通过)\s*([A-Za-z][A-Za-z0-9_.-]*)(?:工具)?/g,
  /(?:利用|使用|调用|借助|通过)\s*([\u4e00-\u9fa5]{1,6}?)(?:工具)/g,
]

/**
 * 工具子句整体移除模式（用于 goal 清理，保持与提取一致）
 * 覆盖"利用 X 检查/测试/验证/实现"、"利用 X 运行测试"等结构，
 * 动词可组合（运行+测试），避免残留孤立动词。
 */
const TOOL_VERB = '(?:来|去)?\\s*(?:检查|测试|验证|实现|构建|编写|执行|运行|操作|调试)(?:\\s*(?:检查|测试|验证|实现|构建|编写|执行|运行|操作|调试))?'
const TOOL_REMOVE_PATTERNS = [
  new RegExp(`(?:利用|使用|调用|借助|通过)\\s*[A-Za-z][A-Za-z0-9_.-]*(?:工具)?(?:\\s*${TOOL_VERB})?`, 'g'),
  new RegExp(`(?:利用|使用|调用|借助|通过)\\s*[\\u4e00-\\u9fa5]{1,6}?(?:工具)?(?:\\s*${TOOL_VERB})?`, 'g'),
]

/**
 * 从文本中提取"直到/直至"条件子句。
 */
function extractConditions(text: string): string[] {
  const conditions: string[] = []
  for (const pattern of CONDITION_PATTERNS) {
    const re = new RegExp(pattern.source, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const cond = m[1]?.trim()
      if (cond && cond.length > 0) {
        // 去掉尾部"为止"等助词
        const cleaned = cond.replace(/(为止|就可以了|就行|即可|才算完成)$/g, '').trim()
        // 去重
        if (cleaned && !conditions.some(c => c === cleaned)) {
          conditions.push(cleaned)
        }
      }
      // 防止零长度匹配死循环
      if (m.index === re.lastIndex) re.lastIndex++
    }
  }
  return conditions
}

/**
 * 从文本中提取工具提示。
 */
function extractToolHints(text: string): string[] {
  const hints: string[] = []
  for (const pattern of TOOL_PATTERNS) {
    const re = new RegExp(pattern.source, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const hint = m[1]?.trim()
      if (hint && hint.length > 0 && hint.length <= 40) {
        // 排除明显非工具词（如"命令行"这类描述性短语），保留 bash/curl 等具体工具
        if (!/^(命令行|命令|脚本|程序|方式|方法|手段)$/.test(hint)) {
          if (!hints.some(h => h === hint)) {
            hints.push(hint)
          }
        }
      }
      if (m.index === re.lastIndex) re.lastIndex++
    }
  }
  return hints
}

/**
 * 清理 goal — 移除所有条件子句与触发词，得到任务主体。
 */
function cleanGoal(raw: string, conditions: string[]): string {
  let goal = raw.trim()
  // 1. 移除条件子句（含"直到"等前缀）
  for (const cond of conditions) {
    goal = goal.replace(new RegExp(`(直到|直至|一直(?:到|至)|循环(?:到|至)|循环执行[^，。；,;]*直到|until|till)\\s*${escapeRegExp(cond)}`, 'gi'), '')
    // 兜底：直接移除"直到X"整体
    goal = goal.replace(new RegExp(`(?:直到|直至)[^，。；,;]*${escapeRegExp(cond)}`, 'g'), '')
  }
  // 2. 移除工具子句（"利用 X / 使用 X / 调用 X"）
  for (const pattern of TOOL_REMOVE_PATTERNS) {
    goal = goal.replace(new RegExp(pattern.source, 'g'), '')
  }
  // 3. 移除孤立触发词（如"循环""反复""迭代"等词本身）
  goal = goal
    .replace(/(请|帮我|麻烦你|请你)?(循环|反复|迭代|重复|持续|不断)(地|的|执行|进行|做)?/g, '')
    .replace(/(请|帮我|麻烦你|请你)?(循环|反复|迭代|重复|持续|不断)/g, '')
    .replace(/keep\s+(?:going|trying|doing)\s*/gi, '')
    .replace(/repeat\s+(?:until|till)\s*/gi, '')
    .replace(/loop\s+until\s*/gi, '')
    .replace(/until\s+[^.,;]+/gi, '')
    .replace(/till\s+[^.,;]+/gi, '')
  // 4. 清理残余标点与空白（合并重复逗号、去掉开头冒号）
  goal = goal
    .replace(/[，。；、,;]+/g, ',')
    .replace(/^[,，：:\s]+/, '')
    .replace(/[,，：:\s]+$/, '')
    .replace(/[,，]+/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim()
  // 5. 去除结尾的"为止"等助词，然后再次清理尾部标点
  goal = goal
    .replace(/(为止|就可以了|就行|即可|才算完成)$/g, '')
    .replace(/[,，：:\s]+$/, '')
    .trim()
  return goal
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 从目标关键词推断策略（复用 autoSelectStrategy 的映射思路）。
 */
export function inferStrategyFromGoal(goal: string): LoopStrategyName | null {
  const g = goal.toLowerCase()
  if (/工作流|workflow|状态机|流程|pipeline|多步|阶段/.test(g)) return 'langgraph'
  if (/团队|协作|多角色|crew|分工|assign/.test(g)) return 'crew'
  if (/研究|探索|调研|创新|发明|brainstorm|探索性/.test(g)) return 'autogpt'
  if (/重构|代码|代码库|软件|工程|bug|缺陷|修复.*代码|github|仓库/.test(g)) return 'swe-agent'
  return null
}

/**
 * 判断一段文本是否是循环意图（快速预检）。
 */
export function isLoopIntentText(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length < 4) return false
  // 以斜杠开头的是命令，不在此处理
  if (trimmed.startsWith('/')) return false
  // 需要同时有触发词 + 条件子句，避免误判普通句子（如"这个循环有问题"）
  const hasTrigger = TRIGGER_PATTERNS.some(p => p.test(trimmed))
  if (!hasTrigger) return false
  // 必须有"直到/直至/循环到/until"这类条件结构才算循环指令
  return /直到|直至|一直(?:到|至)|循环(?:到|至|执行)|until|till|repeat\s+until/i.test(trimmed)
}

/**
 * 从自然语言中提取循环意图。
 *
 * @returns 未命中时返回 null
 */
export function extractLoopIntent(text: string): LoopIntent | null {
  const trimmed = text.trim()
  if (!isLoopIntentText(trimmed)) return null

  const criteria = extractConditions(trimmed)
  const toolHints = extractToolHints(trimmed)
  const goal = cleanGoal(trimmed, criteria)

  if (!goal || goal.length === 0) return null

  return {
    goal,
    criteria,
    toolHints,
    strategyHint: inferStrategyFromGoal(goal),
    raw: trimmed,
  }
}

/**
 * 将循环意图转换为 /loop 命令参数行。
 *
 * 例如：
 *   "循环创建服务器直到能返回 200，利用 bash 测试"
 *   → `/loop "创建服务器" --criteria "能返回 200" --strategy openhands`
 */
export function toLoopCommand(intent: LoopIntent): string {
  const parts: string[] = []
  parts.push(`/loop "${intent.goal.replace(/"/g, '\\"')}"`)
  for (const c of intent.criteria) {
    parts.push(`--criteria "${c.replace(/"/g, '\\"')}"`)
  }
  const strategy = intent.strategyHint ?? 'openhands'
  parts.push(`--strategy ${strategy}`)
  if (intent.toolHints.length > 0) {
    parts.push(`--tools "${intent.toolHints.slice(0, 3).join(', ')}"`)
  }
  return parts.join(' ')
}

/**
 * 将循环意图转换为模型可读的循环执行指令（用于 hook 注入）。
 */
export function toLoopInstruction(intent: LoopIntent): string {
  const lines: string[] = []
  lines.push(`[循环引擎指令] 用户要求以循环方式执行任务，请持续迭代直到满足所有成功标准：`)
  lines.push(`  目标: ${intent.goal}`)
  if (intent.criteria.length > 0) {
    lines.push(`  成功标准:`)
    for (const c of intent.criteria) {
      lines.push(`    - ${c}`)
    }
  }
  if (intent.toolHints.length > 0) {
    lines.push(`  建议使用的工具: ${intent.toolHints.join(', ')}`)
  }
  lines.push(`  终止条件: 所有成功标准均满足后停止循环并汇报结果。`)
  return lines.join('\n')
}
