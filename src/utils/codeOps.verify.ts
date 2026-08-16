/**
 * Verify codeOps.ts — 代码处理工具函数验证
 * 吸收自 Agentless (preprocess_data.py, postprocess_data.py)
 */

import { mergeIntervals, cleanMethodLeftSpace, removeEmptyLines } from './codeOps.js'

let passed = 0
let failed = 0

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    console.log(`  PASS: ${label}`)
    passed++
  } else {
    console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    failed++
  }
}

// ==================== mergeIntervals ====================

console.log('--- mergeIntervals ---')

assertEqual(
  mergeIntervals([[1, 3], [2, 4], [5, 7], [6, 8]]),
  [[1, 4], [5, 8]],
  'overlapping intervals merge'
)

assertEqual(
  mergeIntervals([[1, 5], [2, 3]]),
  [[1, 5]],
  'subset interval absorbed'
)

assertEqual(
  mergeIntervals([[1, 1]]),
  [[1, 1]],
  'single point interval'
)

assertEqual(
  mergeIntervals([[1, 1], [2, 3]]),
  [[1, 1], [2, 3]],
  'disjoint intervals stay separate'
)

assertEqual(
  mergeIntervals([]),
  [],
  'empty input'
)

assertEqual(
  mergeIntervals([[1, 2], [2, 3]]),
  [[1, 3]],
  'adjacent intervals merge'
)

// ==================== cleanMethodLeftSpace ====================

console.log('--- cleanMethodLeftSpace ---')

assertEqual(
  cleanMethodLeftSpace('    line1\n    line2'),
  'line1\nline2',
  'basic 4-space indent'
)

assertEqual(
  cleanMethodLeftSpace('line1\nline2'),
  'line1\nline2',
  'no indent'
)

assertEqual(
  cleanMethodLeftSpace('  line1\n  line2\n  line3'),
  'line1\nline2\nline3',
  '2-space indent'
)

assertEqual(
  cleanMethodLeftSpace('    line1\nline2'),
  'line1\n2',
  'strip first-line indent from all lines (matches Python behavior)'
)

// ==================== removeEmptyLines ====================

console.log('--- removeEmptyLines ---')

assertEqual(
  removeEmptyLines('line1\n\nline2'),
  'line1\nline2',
  'remove blank line'
)

assertEqual(
  removeEmptyLines('line1\n   \nline2'),
  'line1\nline2',
  'remove whitespace-only line'
)

assertEqual(
  removeEmptyLines('line1\nline2'),
  'line1\nline2',
  'no empty lines'
)

assertEqual(
  removeEmptyLines(''),
  '',
  'empty string'
)

// ==================== Summary ====================

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
