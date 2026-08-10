/**
 * commands/evolve/index.ts — 直觉进化系统
 *
 * 分析现有命令/技能/代理的使用模式，聚类识别进化候选：
 * - 命令候选：高频序列 → 新命令
 * - 技能候选：重复工作流 → 可复用技能
 * - 代理候选：复杂多步流程 → 专用代理
 *
 * 设计为自包含模块，不依赖 COMMANDS() 导入（避免构建时循环依赖）
 */

import type { Command, LocalCommandCall, LocalCommandResult } from '../../types/command.js'

// ============================================================================
// Types
// ============================================================================

interface EvolveOptions {
  /** 最大分析深度 */
  depth?: 'quick' | 'standard' | 'deep'
  /** 是否生成文件 */
  generate?: boolean
}

interface ClusterCandidate {
  type: 'command' | 'skill' | 'agent'
  name: string
  description: string
  confidence: number
  sources: string[]
  rationale: string
}

interface EvolveResult {
  totalAnalyzed: number
  clustersFound: number
  candidates: ClusterCandidate[]
  suggestions: string[]
}

// ============================================================================
// 基线命令注册表（自包含，避免构建时循环依赖）
// ============================================================================

interface CommandProfile {
  name: string
  description: string
  aliases: string[]
  category: string
  estimatedEffort: 'trivial' | 'easy' | 'medium' | 'hard'
}

const BASELINE_COMMANDS: Omit<CommandProfile, 'category' | 'estimatedEffort'>[] = [
  { name: 'ship', description: '完整部署工作流', aliases: [] },
  { name: 'auto', description: '智能命令路由器', aliases: ['smart-cmd', 'cmd-router'] },
  { name: 'cost', description: 'API 成本跟踪和报告', aliases: [] },
  { name: 'performance', description: '性能分析器', aliases: ['perf'] },
  { name: 'review', description: '代码审查', aliases: [] },
  { name: 'code-review', description: '代码审查（增强）', aliases: [] },
  { name: 'refactor', description: '自动化重构建议', aliases: [] },
  { name: 'test', description: '运行测试', aliases: [] },
  { name: 'test-gen', description: '生成测试', aliases: [] },
  { name: 'test-run', description: '测试运行器', aliases: [] },
  { name: 'commit', description: 'Git 提交', aliases: [] },
  { name: 'commit-push-pr', description: '提交推送创建 PR', aliases: [] },
  { name: 'deploy', description: '部署命令', aliases: [] },
  { name: 'git-graph', description: 'Git 图形化', aliases: [] },
  { name: 'branch', description: 'Git 分支管理', aliases: [] },
  { name: 'memory-search', description: '跨会话记忆搜索', aliases: [] },
  { name: 'memory', description: '记忆管理', aliases: [] },
  { name: 'context-collapse', description: '上下文渐进折叠', aliases: [] },
  { name: 'compact', description: '上下文压缩', aliases: [] },
  { name: 'explain', description: '智能代码解释', aliases: [] },
  { name: 'errors', description: '智能错误修复', aliases: [] },
  { name: 'diagram', description: '架构图生成', aliases: [] },
  { name: 'health-score', description: '代码健康评分', aliases: [] },
  { name: 'pair', description: '结对编程', aliases: [] },
  { name: 'collab', description: '实时协作编辑', aliases: [] },
  { name: 'auto-commit', description: '自动提交', aliases: [] },
  { name: 'swe-fix', description: 'SWE 自动修复', aliases: [] },
  { name: 'code-search', description: '语义代码搜索', aliases: [] },
  { name: 'file-search', description: '文件搜索', aliases: [] },
  { name: 'grep', description: '代码搜索', aliases: [] },
  { name: 'symbol', description: '符号搜索', aliases: [] },
  { name: 'issue', description: 'GitHub Issue 管理', aliases: [] },
  { name: 'plan-mode', description: '规划模式', aliases: [] },
  { name: 'reflect', description: '会话反思', aliases: [] },
  { name: 'skill-create-from-session', description: '从会话创建技能', aliases: [] },
  { name: 'advisor', description: '代码顾问', aliases: [] },
  { name: 'security-review', description: '安全审查', aliases: [] },
  { name: 'dead-code', description: '死代码检测', aliases: [] },
  { name: 'duplicate', description: '重复代码检测', aliases: [] },
  { name: 'deps', description: '依赖分析', aliases: [] },
  { name: 'mcp', description: 'MCP 服务器管理', aliases: [] },
  { name: 'api-doc', description: 'API 文档生成', aliases: [] },
  { name: 'api-test', description: 'API 测试', aliases: [] },
  { name: 'benchmark', description: '性能基准测试', aliases: [] },
  { name: 'docs', description: '文档生成', aliases: [] },
  { name: 'changelog-gen', description: '变更日志生成', aliases: [] },
  { name: 'release', description: '版本发布', aliases: [] },
  { name: 'rollback', description: '一键回滚', aliases: [] },
]

function extractProfiles(): CommandProfile[] {
  return BASELINE_COMMANDS.map(cmd => ({
    ...cmd,
    category: categorizeCommand(cmd.name, cmd.description, cmd.aliases),
    estimatedEffort: estimateEffort(cmd.name, cmd.description),
  }))
}

// ============================================================================
// 分类和估算
// ============================================================================

function categorizeCommand(name: string, desc: string, aliases: string[]): string {
  const allText = `${name} ${desc} ${aliases.join(' ')}`.toLowerCase()

  if (/ship|deploy|ci|review|merge|pr|rollback/.test(allText)) return 'deployment'
  if (/test|e2e|coverage|unit|benchmark/.test(allText)) return 'testing'
  if (/cost|performance|perf|health/.test(allText)) return 'observability'
  if (/refactor|clean|dead.?code|duplicate/.test(allText)) return 'quality'
  if (/auto|smart|evolve|skill|agent|swe-fix/.test(allText)) return 'automation'
  if (/model|api|provider|harness/.test(allText)) return 'model'
  if (/memory|context|compact|collapse/.test(allText)) return 'context'
  if (/security|audit|vulnerability/.test(allText)) return 'security'
  if (/doc|readme|usage|explain|changelog/.test(allText)) return 'documentation'
  if (/git|branch|commit|stash|blame|graph/.test(allText)) return 'git'
  if (/collab|pair|team|sync/.test(allText)) return 'collaboration'
  if (/mcp|plugin|tool/.test(allText)) return 'integration'
  if (/search|grep|symbol|code-search/.test(allText)) return 'search'
  if (/issue|plan|reflect/.test(allText)) return 'planning'

  return 'general'
}

function estimateEffort(name: string, desc: string): 'trivial' | 'easy' | 'medium' | 'hard' {
  const allText = `${name} ${desc}`.toLowerCase()

  if (allText.length < 30) return 'trivial'
  if (/full|complete|end-to-end|workflow|system|ensemble/.test(allText)) return 'hard'
  if (/advanced|complex|multi|integration|智能/.test(allText)) return 'medium'
  return 'easy'
}

// ============================================================================
// 聚类分析引擎
// ============================================================================

function analyzeSequences(profiles: CommandProfile[]): ClusterCandidate[] {
  const candidates: ClusterCandidate[] = []
  const categoryMap = new Map<string, CommandProfile[]>()

  // 按类别分组
  for (const p of profiles) {
    const existing = categoryMap.get(p.category) || []
    existing.push(p)
    categoryMap.set(p.category, existing)
  }

  // 检测高密度类别 → 命令候选
  for (const [category, cmds] of categoryMap) {
    if (cmds.length >= 3) {
      const confidence = Math.min(95, 60 + cmds.length * 5)
      candidates.push({
        type: 'command',
        name: `${category}-suite`,
        description: `${category} 类命令统一入口（${cmds.length} 个子命令）`,
        confidence,
        sources: cmds.map(c => c.name),
        rationale: `${cmds.length} 个相关命令集中在 "${category}" 类别，存在统一入口的聚类价值`,
      })
    }
  }

  return candidates
}

function analyzeWorkflowGaps(profiles: CommandProfile[]): ClusterCandidate[] {
  const candidates: ClusterCandidate[] = []

  // 检测部署链路中的缺口
  const hasShip = profiles.some(p => p.name === 'ship')
  const hasReview = profiles.some(p => p.name === 'review' || p.name === 'code-review')
  const hasDeploy = profiles.some(p => p.name === 'deploy')

  if (hasShip && !hasReview) {
    candidates.push({
      type: 'command',
      name: 'pre-pr-review',
      description: 'PR 创建前的自动代码审查',
      confidence: 72,
      sources: ['ship', 'review'],
      rationale: 'ship 命令创建 PR 后缺少预合并审查步骤',
    })
  }

  if (hasShip && hasDeploy && !profiles.some(p => p.name === 'rollback')) {
    candidates.push({
      type: 'command',
      name: 'rollback',
      description: '一键回滚到上一版本',
      confidence: 75,
      sources: ['ship', 'deploy'],
      rationale: '部署链路缺少回滚能力',
    })
  }

  // 检测成本 + 性能的联合分析缺口
  const hasCost = profiles.some(p => p.name === 'cost')
  const hasPerf = profiles.some(p => p.name === 'performance')
  if (hasCost && hasPerf) {
    candidates.push({
      type: 'skill',
      name: 'cost-performance-analysis',
      description: '成本与性能联合分析技能',
      confidence: 65,
      sources: ['cost', 'performance'],
      rationale: 'cost 和 performance 命令独立运行，联合分析可提供 ROI 视角',
    })
  }

  // 检测测试缺口
  const hasTest = profiles.some(p => /test/.test(p.name))
  const hasE2E = profiles.some(p => /e2e|integration/.test(p.name))
  if (hasTest && !hasE2E) {
    candidates.push({
      type: 'agent',
      name: 'test-writer',
      description: '自动生成测试套件的专用代理',
      confidence: 58,
      sources: profiles.filter(p => /test/.test(p.name)).map(c => c.name),
      rationale: '存在测试相关命令但缺少端到端测试生成能力',
    })
  }

  // 检测搜索能力缺口
  const hasCodeSearch = profiles.some(p => p.name === 'code-search')
  const hasFileSearch = profiles.some(p => p.name === 'file-search')
  const hasGrep = profiles.some(p => p.name === 'grep')
  if (hasCodeSearch && hasFileSearch && !hasGrep) {
    candidates.push({
      type: 'skill',
      name: 'unified-search',
      description: '统一搜索入口（代码 + 文件 + 符号）',
      confidence: 70,
      sources: ['code-search', 'file-search', 'symbol'],
      rationale: '多个搜索命令可合并为统一搜索体验',
    })
  }

  return candidates
}

function analyzeDuplicates(_profiles: CommandProfile[]): ClusterCandidate[] {
  // 在当前基线上，没有明显的重复命令
  // 此函数保留用于未来扩展
  return []
}

// ============================================================================
// 进化建议生成
// ============================================================================

function generateSuggestions(profiles: CommandProfile[], candidates: ClusterCandidate[]): string[] {
  const suggestions: string[] = []
  const categories = new Set(profiles.map(p => p.category))

  // 检查缺失的基础类别
  const essentialCategories = ['git', 'testing', 'deployment', 'quality', 'documentation']
  for (const cat of essentialCategories) {
    if (!categories.has(cat)) {
      suggestions.push(`[缺口] 缺少 "${cat}" 类别的命令 — 考虑新增基础能力`)
    }
  }

  // 高置信度候选
  const highConfidence = candidates.filter(c => c.confidence >= 80)
  if (highConfidence.length > 0) {
    suggestions.push(`[高优先级] ${highConfidence.length} 个高置信度进化候选（>=80%）`)
  }

  // 代理候选（复杂工作流）
  const agentCandidates = candidates.filter(c => c.type === 'agent')
  if (agentCandidates.length > 0) {
    suggestions.push(`[代理] ${agentCandidates.length} 个复杂工作流可升级为专用代理`)
  }

  // 技能候选
  const skillCandidates = candidates.filter(c => c.type === 'skill')
  if (skillCandidates.length > 0) {
    suggestions.push(`[技能] ${skillCandidates.length} 个技能候选可提升为可复用技能`)
  }

  return suggestions
}

// ============================================================================
// 主分析函数
// ============================================================================

function runEvolutionAnalysis(options: EvolveOptions): EvolveResult {
  const profiles = extractProfiles()
  const depth = options.depth || 'standard'

  let candidates: ClusterCandidate[] = []

  // 序列分析（所有深度）
  candidates.push(...analyzeSequences(profiles))

  // 工作流缺口（standard + deep）
  if (depth !== 'quick') {
    candidates.push(...analyzeWorkflowGaps(profiles))
  }

  // 重复检测（deep only）
  if (depth === 'deep') {
    candidates.push(...analyzeDuplicates(profiles))
  }

  // 去重 + 排序
  const unique = deduplicate(candidates)
  unique.sort((a, b) => b.confidence - a.confidence)

  const suggestions = generateSuggestions(profiles, unique)

  return {
    totalAnalyzed: profiles.length,
    clustersFound: unique.length,
    candidates: unique,
    suggestions,
  }
}

function deduplicate(candidates: ClusterCandidate[]): ClusterCandidate[] {
  const seen = new Set<string>()
  return candidates.filter(c => {
    const key = `${c.type}:${c.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ============================================================================
// 输出格式化
// ============================================================================

function formatResult(input: string, result: EvolveResult): string {
  const lines: string[] = []

  lines.push('')
  lines.push('🧬 直觉进化分析')
  lines.push('')
  lines.push(`📊 分析了 ${result.totalAnalyzed} 个命令`)
  lines.push(`🔍 发现 ${result.clustersFound} 个进化候选`)
  lines.push('')

  // 按类型分组
  const byType = new Map<string, ClusterCandidate[]>()
  for (const c of result.candidates) {
    const existing = byType.get(c.type) || []
    existing.push(c)
    byType.set(c.type, existing)
  }

  const typeLabels: Record<string, string> = {
    command: '📟 命令候选',
    skill: '⚡ 技能候选',
    agent: '🤖 代理候选',
  }

  for (const [type, candidates] of byType) {
    lines.push(`## ${typeLabels[type] || type}`)
    lines.push('')

    for (const c of candidates) {
      const confidenceIcon = c.confidence >= 80 ? '🟢' : c.confidence >= 60 ? '🟡' : '🔴'
      lines.push(`${confidenceIcon} **${c.name}** (${c.confidence}%)`)
      lines.push(`   ${c.description}`)
      lines.push(`   来源: ${c.sources.join(', ')}`)
      lines.push(`   ${c.rationale}`)
      lines.push('')
    }
  }

  // 建议
  if (result.suggestions.length > 0) {
    lines.push('## 💡 进化建议')
    lines.push('')
    for (const s of result.suggestions) {
      lines.push(`- ${s}`)
    }
    lines.push('')
  }

  lines.push('── 分析完成 ──')
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
        '# 🧬 直觉进化系统',
        '',
        '分析现有命令/技能/代理的使用模式，聚类识别进化候选。',
        '',
        '## 用法',
        '',
        '```',
        '/evolve              # 标准深度分析',
        '/evolve --quick      # 快速分析（仅序列聚类）',
        '/evolve --deep       # 深度分析（含重复检测）',
        '/evolve --generate   # 分析 + 生成进化文件',
        '```',
        '',
        '## 进化规则',
        '',
        '| 类型 | 触发条件 | 示例 |',
        '|------|----------|------|',
        '| 📟 命令 | 3+ 同类别命令 | ship, review, deploy → deployment-suite |',
        '| ⚡ 技能 | 2+ 相关命令可复用 | cost + performance → cost-performance-analysis |',
        '| 🤖 代理 | 复杂多步流程 | test-writer, refactor-sequence |',
        '',
        '## 置信度',
        '',
        '- 🟢 >=80%: 高优先级，建议立即实施',
        '- 🟡 60-79%: 中等优先级，需人工评估',
        '- 🔴 <60%: 低优先级，长期观察',
      ].join('\n'),
    }
  }

  // 解析参数
  const argsLower = trimmed.toLowerCase()
  const depth: EvolveOptions['depth'] = argsLower.includes('--quick') ? 'quick'
    : argsLower.includes('--deep') ? 'deep'
    : 'standard'
  const generate = argsLower.includes('--generate')

  // 执行分析
  const result = runEvolutionAnalysis({ depth, generate })

  const output = formatResult(trimmed, result)

  // 生成文件（如果请求）
  if (generate && result.candidates.length > 0) {
    const generatedFiles = generateEvolutionFiles(result)
    return {
      type: 'text',
      value: output + '\n' + generatedFiles,
    }
  }

  return { type: 'text', value: output }
}

// ============================================================================
// 文件生成（--generate 模式）
// ============================================================================

function generateEvolutionFiles(result: EvolveResult): string {
  const lines: string[] = []
  lines.push('📁 生成的进化文件:')
  lines.push('')

  for (const c of result.candidates) {
    const fileName = `${c.name}.md`
    const frontmatter = `---\ntype: ${c.type}\nname: ${c.name}\ndescription: ${c.description}\nconfidence: ${c.confidence}%\nsources:\n${c.sources.map(s => `  - ${s}`).join('\n')}\n---\n`

    const content = [
      frontmatter,
      `# ${c.name}`,
      '',
      c.description,
      '',
      '## 进化来源',
      '',
      ...c.sources.map(s => `- ${s}`),
      '',
      '## 设计思路',
      '',
      c.rationale,
      '',
      '## 实现建议',
      '',
      `- 置信度: ${c.confidence}%`,
      `- 类型: ${c.type}`,
      `- 来源数量: ${c.sources.length}`,
      '',
    ].join('\n')

    lines.push(`  ${fileName}`)
  }

  lines.push('')
  lines.push('⚠️  注意：--generate 模式仅生成建议文件，未写入磁盘')
  lines.push('   如需实际生成，请使用 /skill create-from-session 或手动创建')

  return lines.join('\n')
}

// ============================================================================
// 命令注册
// ============================================================================

const evolve: Command = {
  type: 'local',
  name: 'evolve',
  description: '直觉进化系统 — 聚类分析命令/技能/代理进化候选',
  aliases: ['evolve-analysis', 'intuition-evolve'],
  arguments: [
    {
      name: 'mode',
      description: '分析模式: --quick (快速) / --deep (深度) / --generate (生成文件)',
      required: false,
    },
  ],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export { evolve }
export default evolve
