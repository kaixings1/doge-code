import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'

// 1. Create a shared type declaration file for extended DogeAPI methods
const typesDir = 'D:/doge-code/desktop/src/renderer/types'
if (!existsSync(typesDir)) {
  mkdirSync(typesDir, { recursive: true })
}

const dtsContent = `/**
 * 扩展的 DogeAPI 类型声明
 *
 * 包含后续合并时将添加的 AI 相关 IPC 方法。
 * 这些方法在 preload/index.ts 中注册后会通过 contextBridge 暴露。
 */

import type { DogeAPI } from '../preload/index.js'

/** AI 补全参数 */
export interface AICompleteParams {
  filePath: string
  code: string
  line: number
  column: number
}

/** AI 补全结果 */
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

/** 语义搜索结果 */
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

/** 符号大纲结果 */
export interface GetOutlineResult {
  id: string
  name: string
  kind: string
  range: { startLine: number; startColumn: number; endLine: number; endColumn: number }
  children?: GetOutlineResult[]
  modifiers?: string[]
  detail?: string
}

/** 扩展的 DogeAPI 接口 */
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

declare global {
  interface Window {
    dogeAPI?: ExtendedDogeAPI
  }
}

export {}
`

writeFileSync(`${typesDir}/doge-api-extended.d.ts`, dtsContent)
console.log('Created doge-api-extended.d.ts')

// 2. Remove declare global from each component and import the extended type instead
const components = [
  'D:/doge-code/desktop/src/renderer/components/AdvancedCodeEditor.tsx',
  'D:/doge-code/desktop/src/renderer/components/SemanticSearchPanel.tsx',
  'D:/doge-code/desktop/src/renderer/components/AICodeReviewPanel.tsx',
  'D:/doge-code/desktop/src/renderer/components/OutlinePanel.tsx',
]

for (const compPath of components) {
  let content = readFileSync(compPath, 'utf-8')

  // Remove the declare global block (from "// 扩展 Window 类型声明" to the closing "}")
  const startMarker = '// 扩展 Window 类型声明'
  const endMarker = '  }\n}'

  if (content.includes(startMarker)) {
    const startIdx = content.indexOf(startMarker)
    // Find the end of the declare global block
    const declareStart = content.indexOf('declare global', startIdx)
    if (declareStart !== -1) {
      // Find the matching closing brace
      let braceCount = 0
      let endIdx = declareStart
      for (let i = declareStart; i < content.length; i++) {
        if (content[i] === '{') braceCount++
        if (content[i] === '}') {
          braceCount--
          if (braceCount === 0) {
            endIdx = i + 1
            break
          }
        }
      }
      // Remove the entire declare global block including preceding comment
      content = content.substring(0, startIdx) + content.substring(endIdx)
    }
  }

  writeFileSync(compPath, content)
  console.log(`Removed declare global from ${compPath.split('/').pop()}`)
}

console.log('Done!')
