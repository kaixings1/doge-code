/**
 * 扩展的 DogeAPI 类型声明（纯类型文件，无运行时代码）
 *
 * 此文件是 Window.dogeAPI 的唯一类型声明来源。
 * 所有后续合并时添加的 AI 相关 IPC 方法都在此声明。
 *
 *  注意：其他文件不应再声明 declare global { interface Window { ... } }
 * 如需添加新 API，请在本文件中扩展 ExtendedDogeAPI 接口。
 */

import type { DogeAPI } from '../../preload/index.js'

// ─── 扩展 API 参数/结果类型 ───

/** AI 补全参数 */
export interface AICompleteParams {
  filePath: string
  code: string
  line: number
  column: number
}

/** AI 补全结果项 */
export interface AICompletionItem {
  insertText: string
  endLine?: number
  endColumn?: number
  documentation?: string
}

/** 语义搜索参数 */
export interface SemanticSearchParams {
  query: string
  cwd: string
  maxResults?: number
  fileTypes?: string[]
  directories?: string[]
}

/** 语义搜索结果项 */
export interface SemanticSearchResult {
  filePath: string
  lineNumber: number
  column: number
  content: string
  score: number
  context?: string
}

/** 代码审查参数 */
export interface CodeReviewParams {
  filePath: string
  cwd: string
}

/** 代码审查结果 */
export interface CodeReviewResultData {
  score: {
    overall: number
    security: number
    performance: number
    maintainability: number
    testability: number
  }
  findings: Array<{
    id: string
    category: string
    severity: string
    title: string
    description: string
    filePath: string
    lineNumber: number
    column?: number
    suggestedFix?: string
    originalCode?: string
  }>
  duration?: number
}

/** 应用修复参数 */
export interface ApplyFixParams {
  filePath: string
  lineNumber: number
  column?: number
  fixedCode: string
  originalCode?: string
}

/** 符号大纲参数 */
export interface GetOutlineParams {
  filePath: string
  cwd: string
}

/** 符号大纲结果项 */
export interface GetOutlineResult {
  id: string
  name: string
  kind: string
  range: { startLine: number; startColumn: number; endLine: number; endColumn: number }
  children?: GetOutlineResult[]
  modifiers?: string[]
  detail?: string
}

/** 格式化工具类型 */
export type FormatterTool = 'prettier' | 'biome' | 'dprint' | 'clang-format' | 'eslint'

// ─── 扩展的 DogeAPI 接口 ───

/** 扩展的 DogeAPI 接口（包含所有新增的 AI 方法） */
export interface ExtendedDogeAPI extends DogeAPI {
  aiComplete?: (params: AICompleteParams) => Promise<{
    success: boolean
    completions?: AICompletionItem[]
    error?: string
  }>
  semanticSearch?: (params: SemanticSearchParams) => Promise<{
    success: boolean
    results?: SemanticSearchResult[]
    error?: string
  }>
  codeReview?: (params: CodeReviewParams) => Promise<{
    success: boolean
    result?: CodeReviewResultData
    error?: string
  }>
  applyFix?: (params: ApplyFixParams) => Promise<{
    success: boolean
    error?: string
  }>
  getOutline?: (params: GetOutlineParams) => Promise<{
    success: boolean
    symbols?: GetOutlineResult[]
    error?: string
  }>
  formatCode?: (params: {
    code: string
    language: string
    tool: FormatterTool
    cwd: string
    range?: { start: number; end: number }
  }) => Promise<{ success: boolean; output?: string; error?: string }>
}

// ─── 全局 Window 接口声明（唯一入口） ───

declare global {
  interface Window {
    /** Doge Code Desktop 主 API（扩展版本） */
    dogeAPI: ExtendedDogeAPI & Record<string, any>
  }
}
