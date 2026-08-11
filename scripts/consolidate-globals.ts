import { readFileSync, writeFileSync } from 'fs'

// 1. Update the .d.ts file to include ALL extended methods from all agents
const dtsPath = 'D:/doge-code/desktop/src/renderer/types/doge-api-extended.d.ts'
const dtsContent = `/**
 * 扩展的 DogeAPI 类型声明（纯类型文件，无运行时代码）
 *
 * 此文件是 Window.dogeAPI 的唯一类型声明来源。
 * 所有后续合并时添加的 AI 相关 IPC 方法都在此声明。
 */

import type { DogeAPI } from '../../preload/index.js'

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
export type FormatterTool = 'prettier' | 'biome' | 'dprint' | 'clang-format'

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

// 数据库 IPC API 类型声明
export interface DatabaseIPC {
  dogeDBConnect?: (conn: any) => Promise<{ success: boolean; error?: string }>
  dogeDBTables?: (connectionId: string) => Promise<{ success: boolean; tables: Array<{ name: string; columns: any[] }>; error?: string }>
  dogeDBQuery?: (connectionId: string, sql: string) => Promise<{ success: boolean; rows: any[]; error?: string }>
}

// 重新声明 Window 接口，扩展 dogeAPI 类型
declare global {
  interface Window {
    dogeAPI?: ExtendedDogeAPI
  }
}
`

writeFileSync(dtsPath, dtsContent)
console.log('Updated doge-api-extended.d.ts with all methods')

// 2. Remove declare global from useDatabase.ts
const dbPath = 'D:/doge-code/desktop/src/renderer/hooks/useDatabase.ts'
let dbContent = readFileSync(dbPath, 'utf-8')
const dbDeclareRegex = /declare global \{\s*interface Window \{[\s\S]*?dogeDB[\s\S]*?\}[\s\S]*?\}/
if (dbDeclareRegex.test(dbContent)) {
  dbContent = dbContent.replace(dbDeclareRegex, '')
  writeFileSync(dbPath, dbContent)
  console.log('Removed declare global from useDatabase.ts')
}

// 3. Remove declare global from CodeFormatter.tsx
const cfPath = 'D:/doge-code/desktop/src/renderer/components/CodeFormatter.tsx'
let cfContent = readFileSync(cfPath, 'utf-8')
const cfDeclareRegex = /declare global \{\s*interface Window \{[\s\S]*?dogeAPI[\s\S]*?\}[\s\S]*?\}/
if (cfDeclareRegex.test(cfContent)) {
  cfContent = cfContent.replace(cfDeclareRegex, '')
  writeFileSync(cfPath, cfContent)
  console.log('Removed declare global from CodeFormatter.tsx')
}

console.log('Done!')
