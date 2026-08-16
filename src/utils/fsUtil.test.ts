/**
 * fsUtil.ts 闭环测试
 */

import { writeText, readText, appendText } from './fsUtil.js'
import { existsSync, unlinkSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const testDir = join(process.cwd(), '.tmp_test_fsutil')

let pass = 0, fail = 0

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    console.log(`  OK ${label} => ${a}`)
    pass++
  } else {
    console.log(`  FAIL ${label}`)
    console.log(`     actual : ${a}`)
    console.log(`     expect : ${e}`)
    fail++
  }
}

mkdirSync(testDir, { recursive: true })

try {
  console.log('\n== writeText / readText ==')

  const f1 = join(testDir, 't1.txt')
  writeText(f1, 'hello world')
  check('plain text', readText(f1), 'hello world')

  const f2 = join(testDir, 't2.txt')
  writeText(f2, '你好世界')
  check('chinese', readText(f2), '你好世界')

  const f3 = join(testDir, 't3.txt')
  writeText(f3, 'line1\r\nline2\nline3\rline4')
  check('line endings', readText(f3), 'line1\nline2\nline3\nline4')

  const f4 = join(testDir, 't4.txt')
  const special = 'tab\there\njson: {"key":"value"}\nemoji: \u{1F680}'
  writeText(f4, special)
  check('special chars', readText(f4), special)

  const f5 = join(testDir, 't5.txt')
  check('missing default', readText(f5, 'default_val'), 'default_val')

  const f6 = join(testDir, 't6.txt')
  try {
    readText(f6)
    check('missing throws', 'no-error', 'should-throw')
  } catch {
    check('missing throws', 'threw', 'threw')
  }

  console.log('\n== appendText ==')

  const f7 = join(testDir, 't7.txt')
  writeText(f7, 'initial\n')
  appendText(f7, 'appended\n')
  check('append', readText(f7), 'initial\nappended\n')

  const f8 = join(testDir, 't8.txt')
  appendText(f8, 'first line\n')
  check('append creates', readText(f8), 'first line\n')

  console.log('\n== edge cases ==')

  const f9 = join(testDir, 't9.txt')
  writeText(f9, '')
  check('empty write', readText(f9), '')

  const f10 = join(testDir, 't10.txt')
  writeText(f10, '\n\n\n')
  check('only newlines', readText(f10), '\n\n\n')

  const f11 = join(testDir, 't11.txt')
  const bin = 'bin: \x00\x01\x02\xff\xfe'
  writeText(f11, bin)
  check('binary chars', readText(f11), bin)

  const f12 = join(testDir, 't12.txt')
  const big = 'x'.repeat(100000)
  writeText(f12, big)
  check('large content len', readText(f12).length, 100000)

  const f13 = join(testDir, 't13.txt')
  writeText(f13, 'original')
  writeText(f13, 'updated')
  check('overwrite', readText(f13), 'updated')

  const f14 = join(testDir, 't14.txt')
  writeText(f14, '')
  appendText(f14, 'a\n')
  appendText(f14, 'b\n')
  appendText(f14, 'c\n')
  check('multi append', readText(f14), 'a\nb\nc\n')

  try {
    readText(testDir)
    check('read dir throws', 'no-error', 'should-throw')
  } catch {
    check('read dir throws', 'threw', 'threw')
  }

  const f15 = join(testDir, 't15.txt')
  writeText(f15, '')
  check('empty roundtrip', readText(f15), '')

} finally {
  try { rmSync(testDir, { recursive: true }) } catch {}
}

console.log(`\nfsUtil: ${pass} pass, ${fail} fail`)
if (fail > 0) process.exit(1)
console.log('ALL PASS')
