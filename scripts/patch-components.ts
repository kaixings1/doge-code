import { readFileSync, writeFileSync } from 'fs'

// Fix SemanticSearchPanel
const ssPath = 'D:/doge-code/desktop/src/renderer/components/SemanticSearchPanel.tsx'
let ssContent = readFileSync(ssPath, 'utf-8')

// Add declare global after imports
const ssImportEnd = "import type { ThemeColors } from '../theme.js'"
const ssDeclareGlobal = `${ssImportEnd}

// 扩展 Window 类型声明
declare global {
  interface Window {
    dogeAPI?: {
      semanticSearch?: (params: {
        query: string
        cwd: string
        maxResults?: number
        fileTypes?: string[]
        directories?: string[]
      }) => Promise<{
        success: boolean
        results?: Array<{
          filePath: string
          lineNumber: number
          column: number
          content: string
          score: number
          context?: string
        }>
        error?: string
      }>
      [key: string]: any
    }
  }
}`

if (!ssContent.includes('declare global')) {
  ssContent = ssContent.replace(ssImportEnd, ssDeclareGlobal)
}

// Fix setHistory(newItem) -> setHistory(newHistory)
ssContent = ssContent.replace('setHistory(newItem)\n        saveSearchHistory(newHistory)', 'setHistory(newHistory)\n        saveSearchHistory(newHistory)')

// Fix window.dogeAPI.semanticSearch -> window.dogeAPI?.semanticSearch
ssContent = ssContent.replace('window.dogeAPI.semanticSearch({', 'window.dogeAPI?.semanticSearch({')

writeFileSync(ssPath, ssContent)
console.log('SemanticSearchPanel patched')

// Fix AICodeReviewPanel
const reviewPath = 'D:/doge-code/desktop/src/renderer/components/AICodeReviewPanel.tsx'
let reviewContent = readFileSync(reviewPath, 'utf-8')

const reviewImportEnd = "import type { ThemeColors } from '../theme.js'"
const reviewDeclareGlobal = `${reviewImportEnd}

// 扩展 Window 类型声明
declare global {
  interface Window {
    dogeAPI?: {
      codeReview?: (params: {
        filePath: string
        cwd: string
      }) => Promise<{
        success: boolean
        result?: {
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
        error?: string
      }>
      applyFix?: (params: {
        filePath: string
        lineNumber: number
        column?: number
        fixedCode: string
        originalCode?: string
      }) => Promise<{ success: boolean; error?: string }>
      [key: string]: any
    }
  }
}`

if (!reviewContent.includes('declare global')) {
  reviewContent = reviewContent.replace(reviewImportEnd, reviewDeclareGlobal)
}

// Fix window.dogeAPI calls
reviewContent = reviewContent.replace('await window.dogeAPI.codeReview({', 'await window.dogeAPI?.codeReview?.({')
reviewContent = reviewContent.replace('await window.dogeAPI.applyFix({', 'await window.dogeAPI?.applyFix?.({')

writeFileSync(reviewPath, reviewContent)
console.log('AICodeReviewPanel patched')

// Fix OutlinePanel
const outlinePath = 'D:/doge-code/desktop/src/renderer/components/OutlinePanel.tsx'
let outlineContent = readFileSync(outlinePath, 'utf-8')

const outlineImportEnd = "import type { ThemeColors } from '../theme.js'"
const outlineDeclareGlobal = `${outlineImportEnd}

// 扩展 Window 类型声明
declare global {
  interface Window {
    dogeAPI?: {
      getOutline?: (params: {
        filePath: string
        cwd: string
      }) => Promise<{
        success: boolean
        symbols?: Array<{
          id: string
          name: string
          kind: string
          range: { startLine: number; startColumn: number; endLine: number; endColumn: number }
          children?: any[]
          modifiers?: string[]
          detail?: string
        }>
        error?: string
      }>
      [key: string]: any
    }
  }
}`

if (!outlineContent.includes('declare global')) {
  outlineContent = outlineContent.replace(outlineImportEnd, outlineDeclareGlobal)
}

// Fix window.dogeAPI call
outlineContent = outlineContent.replace('await window.dogeAPI.getOutline({', 'await window.dogeAPI?.getOutline?.({')

writeFileSync(outlinePath, outlineContent)
console.log('OutlinePanel patched')
