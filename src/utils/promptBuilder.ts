/**
 * promptBuilder.ts — AI 代码审查 prompt 组装器
 *
 * 功能：将 diff 上下文、文件内容和审查规则组装为 AI 审查 prompt，
 * 支持多种审查模式（安全、质量、综合）。
 */

import type { ParsedDiff, DiffHunk } from './diffParser.js'

// ============================================================================
// Types
// ============================================================================

export type ReviewMode = 'comprehensive' | 'security' | 'quality' | 'performance'

export interface ReviewPromptOptions {
  /** 审查模式 */
  mode?: ReviewMode
  /** 额外上下文（项目描述、语言等） */
  context?: string
  /** 自定义审查规则 */
  customRules?: string[]
  /** 是否包含未变更文件的上下文 */
  includeUnchangedFiles?: boolean
  /** 最大字符数限制 */
  maxChars?: number
}

export interface BuiltPrompt {
  /** 系统提示词 */
  systemPrompt: string
  /** 用户消息（含 diff 上下文） */
  userMessage: string
  /** 估算的 token 数量 */
  estimatedTokens: number
}

// ============================================================================
// Review Rules by Mode
// ============================================================================

const REVIEW_RULES: Record<ReviewMode, string> = {
  comprehensive: `
## 审查规则（综合模式）

请全面审查以下代码变更，涵盖以下方面：

### 安全性
- SQL 注入、XSS、命令注入风险
- 硬编码的密钥、密码、token
- 不安全的反序列化
- 路径遍历漏洞
- 权限校验缺失

### 代码质量
- 未处理的错误和异常
- 资源泄漏（未关闭的文件、连接）
- 内存泄漏风险
- 循环依赖和不必要的复杂性
- 魔法数字和硬编码值

### 最佳实践
- 类型安全和类型推断
- 异步处理的正确性
- 输入验证和边界检查
- API 设计的合理性
- 文档和注释的完整性`,

  security: `
## 审查规则（安全模式）

请重点审查以下代码变更中的安全问题：

### 注入漏洞
- SQL 注入：检查字符串拼接的 SQL 查询
- XSS：检查用户输入的渲染
- 命令注入：检查 shell 命令执行
- 路径遍历：检查文件路径操作
- SSRF：检查 URL 请求的来源

### 认证与授权
- 权限校验缺失
- 敏感数据泄露
- 不安全的 token 处理
- 会话管理问题

### 数据安全
- 硬编码密钥
- 不安全的加密
- 数据序列化风险
- 敏感日志输出`,

  quality: `
## 审查规则（质量模式）

请重点审查代码质量和可维护性：

### 可读性
- 命名规范
- 函数长度和复杂度
- 注释质量
- 代码结构清晰度

### 可维护性
- 重复代码（DRY 原则）
- 耦合度
- 单一职责原则
- 依赖管理

### 鲁棒性
- 错误处理
- 边界条件
- 空值处理
- 资源管理`,

  performance: `
## 审查规则（性能模式）

请重点审查代码性能问题：

### 算法效率
- 时间复杂度问题
- 不必要的循环嵌套
- 重复计算

### 资源使用
- 内存泄漏
- 大对象拷贝
- 数据库查询优化
- 缓存策略

### I/O 优化
- 批量操作
- 异步并发
- 连接复用`,
}

// ============================================================================
// Prompt Builder
// ============================================================================

/**
 * 构建 AI 代码审查 prompt。
 */
export function buildReviewPrompt(
  parsed: ParsedDiff,
  options: ReviewPromptOptions = {},
): BuiltPrompt {
  const {
    mode = 'comprehensive',
    context,
    customRules = [],
    maxChars = 100_000,
  } = options

  const rulesSection = REVIEW_RULES[mode]
  const customRulesSection =
    customRules.length > 0
      ? `\n### 自定义规则\n${customRules.map(r => `- ${r}`).join('\n')}`
      : ''

  const systemPrompt = buildSystemPrompt(mode, context, customRulesSection)

  const userMessage = buildUserMessage(parsed, rulesSection, customRulesSection, maxChars)

  const estimatedTokens = estimateTokens(systemPrompt + userMessage)

  return { systemPrompt, userMessage, estimatedTokens }
}

function buildSystemPrompt(
  mode: ReviewMode,
  context: string | undefined,
  customRules: string,
): string {
  const lines: string[] = []

  lines.push('你是一位专业的代码审查员。请对以下代码变更进行详细审查。')
  lines.push('')
  lines.push(`审查模式: ${mode}`)
  lines.push('')

  if (context) {
    lines.push(`项目背景: ${context}`)
    lines.push('')
  }

  lines.push(customRules)
  lines.push('')
  lines.push('## 输出格式要求')
  lines.push('')
  lines.push('请以 JSON 数组格式返回审查结果，每条评论包含以下字段：')
  lines.push('```json')
  lines.push('[')
  lines.push('  {')
  lines.push('    "filePath": "相对文件路径",')
  lines.push('    "lineNumber": 行号（新文件视角，可选）,')
  lines.push('    "oldLineNumber": 行号（旧文件视角，可选）,')
  lines.push('    "content": "具体问题描述和建议",')
  lines.push('    "severity": "error | warning | info",')
  lines.push('    "category": "问题类别（如 security / quality / performance）"')
  lines.push('  }')
  lines.push(']')
  lines.push('```')
  lines.push('')
  lines.push('severity 说明：')
  lines.push('- error: 必须修复的安全漏洞或严重问题')
  lines.push('- warning: 潜在问题或不符合最佳实践')
  lines.push('- info: 改进建议或优化提示')
  lines.push('')
  lines.push('如果不存在问题，返回空数组 []。')

  return lines.join('\n')
}

function buildUserMessage(
  parsed: ParsedDiff,
  rulesSection: string,
  customRules: string,
  maxChars: number,
): string {
  const lines: string[] = []

  lines.push('## 代码变更')
  lines.push('')
  lines.push(`共 ${parsed.fileCount} 个文件，`)
  if (parsed.hasBinaryChanges) {
    lines.push('包含二进制文件变更。')
  }
  lines.push('')

  let totalChars = 0
  const truncatedFiles: string[] = []

  for (const [filePath, hunks] of parsed.hunks) {
    const fileSection = buildFileSection(filePath, hunks)
    if (totalChars + fileSection.length > maxChars) {
      truncatedFiles.push(filePath)
      continue
    }
    lines.push(fileSection)
    totalChars += fileSection.length
  }

  if (truncatedFiles.length > 0) {
    lines.push('')
    lines.push(`... 还有 ${truncatedFiles.length} 个文件因长度限制未显示`)
  }

  lines.push('')
  lines.push(rulesSection)
  lines.push(customRules)
  lines.push('')
  lines.push('---')
  lines.push('请根据以上 diff 内容和审查规则，输出 JSON 格式的审查结果。')

  return lines.join('\n')
}

function buildFileSection(filePath: string, hunks: DiffHunk[]): string {
  const lines: string[] = []
  lines.push(`### ${filePath}`)
  lines.push('```diff')

  for (const hunk of hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`)
    for (const change of hunk.changes) {
      const prefix = change.type === 'added' ? '+' : change.type === 'removed' ? '-' : ' '
      lines.push(`${prefix}${change.content}`)
    }
  }

  lines.push('```')
  lines.push('')

  return lines.join('\n')
}

// ============================================================================
// Utilities
// ============================================================================

function estimateTokens(text: string): number {
  // 粗略估算：1 token ≈ 4 个字符（英文）
  return Math.ceil(text.length / 4)
}

/**
 * 快速预览 prompt 大小（用于在发送前检查是否超出限制）。
 */
export function estimatePromptSize(parsed: ParsedDiff): number {
  const { systemPrompt, userMessage } = buildReviewPrompt(parsed, {
    mode: 'comprehensive',
    maxChars: 200_000,
  })
  return estimateTokens(systemPrompt + userMessage)
}
