/**
 * commands/auto/index.ts — 智能命令路由器
 *
 * 根据用户输入自动选择最合适的命令执行。
 * 通过关键词匹配 + 优先级权重进行最佳匹配。
 *
 * 用法:
 *   /auto <用户输入>
 *   /auto 修复构建错误
 *   /auto 帮我审查代码
 *   /auto 用 TDD 实现用户登录
 */

import type { Command, LocalCommandCall, LocalCommandResult } from '../types/command.js'
import { execSync } from 'child_process'

// ============================================================================
// Types
// ============================================================================

interface Rule {
  priority: number        // P0=0, P1=1, P2=2, P3=3, P4=4
  keywords: string[]      // 匹配关键词（小写）
  command: string         // 目标命令名
  description: string     // 适用场景描述
}

interface MatchResult {
  command: string
  reason: string
  keywords: string[]
  priority: number
  alternatives: Rule[]
}

// ============================================================================
// 路由规则表
// ============================================================================

const ROUTING_RULES: Rule[] = [
  // P0 - 阻塞性问题，必须立即处理
  {
    priority: 0,
    keywords: ['构建失败', 'build fail', '❌ 错误: build 失败', 'build', '类型错误', 'type error', '编译错误', 'compile error', 'tsc 报错', 'npm run build', '编译不通过'],
    command: 'build-fix',
    description: '项目无法编译、TypeScript 类型检查失败、构建流程中断',
  },
  // P1 - 质量保障
  {
    priority: 1,
    keywords: ['e2e', '端到端', 'playwright', 'cypress', '浏览器测试', '用户流程测试', '自动化测试', 'UI 测试'],
    command: 'test',
    description: '编写或运行端到端测试、验证用户交互流程',
  },
  {
    priority: 1,
    keywords: ['覆盖率', 'coverage', '测试报告', '未覆盖代码', '覆盖率不足', 'istanbul', 'jest coverage'],
    command: 'test-coverage',
    description: '生成测试覆盖率报告、识别未测试代码',
  },
  {
    priority: 1,
    keywords: ['tdd', '测试驱动', '单元测试', 'unit test', '先写测试', 'vitest', 'jest', '测试优先'],
    command: 'plan',
    description: '采用 TDD 方法开发新功能、编写单元测试',
  },
  // P2 - 代码质量优化
  {
    priority: 2,
    keywords: ['审查', 'review', '检查代码', 'code review', '代码质量', '安全检查', '漏洞', '最佳实践'],
    command: 'review',
    description: '提交前代码审查、安全漏洞扫描、代码质量评估',
  },
  // P3 - 代码质量优化
  {
    priority: 3,
    keywords: ['清理', '重构', 'refactor', '删除未使用', 'dead code', '优化结构', '整理代码', '抽取公共', '消除重复'],
    command: 'refactor',
    description: '移除死代码、优化代码结构、提取公共逻辑',
  },
  {
    priority: 3,
    keywords: ['文档', 'docs', 'README', '注释', 'API 文档', '使用说明', '更新文档', '写文档'],
    command: 'update-docs',
    description: '更新项目文档、编写 README、生成 API 文档',
  },
  {
    priority: 3,
    keywords: ['代码地图', 'codemap', '架构图', '模块关系', '依赖分析', '项目结构'],
    command: 'repo-map',
    description: '生成代码架构图、分析模块依赖、可视化项目结构',
  },
]

// 兜底规则（P4）
const FALLBACK_RULE: Rule = {
  priority: 4,
  keywords: ['实现', '开发', '功能', 'feature', '新增', '添加', '创建', '修改', 'implement', 'develop', '写', '做', '帮我', '帮'],
  command: 'plan',
  description: '新功能开发、现有功能修改、任何未匹配的开发任务',
}

// ============================================================================
// 匹配逻辑
// ============================================================================

/**
 * 计算输入与规则的匹配分数
 * 返回 (score, matchedKeywords)
 */
function scoreInput(input: string, rule: Rule): { score: number; matchedKeywords: string[] } {
  const inputLower = input.toLowerCase()
  let score = 0
  const matched: string[] = []

  for (const kw of rule.keywords) {
    if (inputLower.includes(kw.toLowerCase())) {
      score += kw.length  // 长关键词权重更高
      matched.push(kw)
    }
  }

  return { score, matchedKeywords: matched }
}

/**
 * 选择最佳匹配命令
 */
function selectCommand(input: string): MatchResult {
  if (!input.trim()) {
    return {
      command: 'plan',
      reason: '空输入，默认进入规划模式',
      keywords: [],
      priority: 4,
      alternatives: [],
    }
  }

  // 收集所有匹配（含兜底）
  const allRules = [...ROUTING_RULES, FALLBACK_RULE]
  const matches: Array<{ rule: Rule; score: number; matched: string[] }> = []

  for (const rule of allRules) {
    const { score, matchedKeywords } = scoreInput(input, rule)
    if (score > 0) {
      matches.push({ rule, score, matched: matchedKeywords })
    }
  }

  if (matches.length === 0) {
    // 没有任何关键词匹配，使用兜底
    return {
      command: FALLBACK_RULE.command,
      reason: FALLBACK_RULE.description,
      keywords: [],
      priority: FALLBACK_RULE.priority,
      alternatives: [],
    }
  }

  // 按优先级排序（优先级数字小优先），同优先级按分数排序
  matches.sort((a, b) => {
    if (a.rule.priority !== b.rule.priority) return a.rule.priority - b.rule.priority
    return b.score - a.score
  })

  const best = matches[0]!
  const alternatives = matches
    .slice(1)
    .filter(m => m.rule.priority === best.rule.priority)
    .map(m => m.rule)

  return {
    command: best.rule.command,
    reason: best.rule.description,
    keywords: best.matched,
    priority: best.rule.priority,
    alternatives,
  }
}

// ============================================================================
// 格式输出
// ============================================================================

function formatResult(input: string, result: MatchResult): string {
  const priorityLabels = ['P0 紧急', 'P1 高', 'P2 中', 'P3 低', 'P4 默认']
  const lines: string[] = []

  lines.push('')
  lines.push('📊 智能命令选择')
  lines.push('')
  lines.push(`🎯 已选择: /${result.command}`)
  lines.push(`📝 原因: ${result.reason}`)
  lines.push(`🔍 关键词: ${result.keywords.length > 0 ? result.keywords.join(', ') : '(默认路由)'}`)
  lines.push(`⚡ 优先级: ${priorityLabels[result.priority]}`)

  if (result.alternatives.length > 0) {
    lines.push('')
    lines.push('⌨️ ⌨️ 💡 备选命令: ')
    for (const alt of result.alternatives) {
      lines.push(`   /${alt.command} — ${alt.description}`)
    }
  }

  lines.push('')
  lines.push(`── 正在执行 /${result.command} ...`)
  lines.push('')

  return lines.join('\n')
}

// ============================================================================
// 命令实现
// ============================================================================

const call: LocalCommandCall = async (args: string): Promise<LocalCommandResult> => {
  const trimmed = (args ?? '').trim()

  if (trimmed === '--help' || trimmed === 'help') {
    return {
      type: 'text',
      value: [
        '# 📊 智能命令路由器',
        '',
        '根据用户输入自动选择最合适的命令执行。',
        '',
        '## 用法',
        '',
        '```',
        '/auto <用户输入>',
        '```',
        '',
        '## 路由规则',
        '',
        '| 优先级 | 关键词 | 命令 |',
        '|--------|--------|------|',
        '❌ 错误: | P0 | 构建失败、类型错误、编译错误 | build-fix |',
        '| P1 | e2e、端到端、浏览器测试 | test |',
        '| P1 | 覆盖率、coverage | test-coverage |',
        '| P1 | tdd、测试驱动、单元测试 | plan |',
        '| P2 | 审查、review、代码质量 | review |',
        '| P3 | 重构、refactor、清理 | refactor |',
        '| P3 | 文档、docs、README | update-docs |',
        '| P3 | 代码地图、架构图 | repo-map |',
        '| P4 | 实现、开发、功能（兜底） | plan |',
        '',
        '## 示例',
        '',
        '```',
        '/auto npm run build 报错了，类型不匹配',
        '/auto 帮我检查一下这段代码有没有安全问题',
        '/auto 我想用 TDD 的方式实现购物车功能',
        '/auto 添加用户登录功能',
        '```',
      ].join('\n'),
    }
  }

  const result = selectCommand(trimmed)
  const output = formatResult(trimmed, result)

  // 尝试执行选中的命令
  try {
    const commandOutput = execSync(
      `npx doge ${result.command} ${trimmed}`,
      { encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim()

    return {
      type: 'text',
      value: output + '\n' + commandOutput,
    }
  } catch {
    // 如果执行失败，返回路由结果，让用户手动执行
    return {
      type: 'text',
      value: output + '\n\n⚠️ 无法自动执行，请手动运行:',
    }
  }
}

// ============================================================================
// 命令注册
// ============================================================================

const auto: Command = {
  type: 'local',
  name: 'auto',
  description: '智能命令路由器 — 根据用户输入自动选择最合适的命令',
  aliases: ['smart-cmd', 'cmd-router'],
  arguments: [
    {
      name: 'input',
      description: '用户输入的自然语言描述',
      required: true,
    },
  ],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export { ROUTING_RULES, FALLBACK_RULE, selectCommand }

export default auto
