import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'

// Create the types directory
const typesDir = 'D:/doge-code/desktop/src/renderer/types'
if (!existsSync(typesDir)) {
  mkdirSync(typesDir, { recursive: true })
}

// Write a pure type declaration file (no runtime exports)
// This declares the EXTENDED window.dogeAPI with new AI methods
const dtsContent = `/**
 * 扩展的 DogeAPI 类型声明（纯类型文件，无运行时代码）
 *
 * 此文件扩展 Window 接口，添加后续合并时将实现的 AI 相关 IPC 方法。
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

/** 扩展的 DogeAPI 接口（包含新增的 AI 方法） */
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
}

// 重新声明 Window 接口，扩展 dogeAPI 类型
declare global {
  interface Window {
    dogeAPI?: ExtendedDogeAPI
  }
}
`

writeFileSync(`${typesDir}/doge-api-extended.d.ts`, dtsContent)
console.log('Created doge-api-extended.d.ts with proper global declaration')

// Now update App.tsx to remove its own declare global and import the extended type
const appPath = 'D:/doge-code/desktop/src/renderer/App.tsx'
let appContent = readFileSync(appPath, 'utf-8')

// Remove the old declare global block
const oldDeclare = `declare global {
  interface Window {
    dogeAPI?: import('./types/doge-api-extended.js').ExtendedDogeAPI
  }
}`

if (appContent.includes(oldDeclare)) {
  appContent = appContent.replace(oldDeclare, '')
  writeFileSync(appPath, appContent)
  console.log('Removed declare global from App.tsx')
}

// Also remove declare global from components if any remain
const components = [
  'D:/doge-code/desktop/src/renderer/components/AdvancedCodeEditor.tsx',
  'D:/doge-code/desktop/src/renderer/components/SemanticSearchPanel.tsx',
  'D:/doge-code/desktop/src/renderer/components/AICodeReviewPanel.tsx',
  'D:/doge-code/desktop/src/renderer/components/OutlinePanel.tsx',
]

for (const compPath of components) {
  let content = readFileSync(compPath, 'utf-8')
  const declarePattern = /declare global \{[\s\S]*?interface Window \{[\s\S]*?dogeAPI\?[\s\S]*?\}[\s\S]*?\}/

  if (declarePattern.test(content)) {
    content = content.replace(declarePattern, '')
    writeFileSync(compPath, content)
    console.log(`Cleaned declare global from ${compPath.split('/').pop()}`)
  }
}

console.log('Done!')
