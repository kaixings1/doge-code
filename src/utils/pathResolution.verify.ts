/**
 * pathResolution.ts 闭环测试
 * 注意：部分测试需要实际文件系统操作，这里主要测试纯函数分支
 */

import { resolveExistingFilePath } from './pathResolution.js'

let pass = 0, fail = 0

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    console.log(`  ✅ ${label} => ${a}`)
    pass++
  } else {
    console.log(`  ❌ ${label}`)
    console.log(`     实际  : ${a}`)
    console.log(`     预期  : ${e}`)
    fail++
  }
}

// ==================== resolveExistingFilePath 分支 ====================
console.log('\n========== resolveExistingFilePath 分支 ==========')

console.log('\n[分支1] 文件存在 → 返回原路径')
// 创建一个临时文件测试
import fs from 'node:fs'
import path from 'node:path'
const tmpDir = path.join(process.cwd(), '.tmp_test_path_resolution')
fs.mkdirSync(tmpDir, { recursive: true })
const existingFile = path.join(tmpDir, 'test.txt')
fs.writeFileSync(existingFile, 'hello')
check('existing file returns same path', resolveExistingFilePath(existingFile), existingFile)

console.log('\n[分支2] 文件不存在 → 尝试变体后返回 undefined')
check('nonexistent file → undefined', resolveExistingFilePath(path.join(tmpDir, 'nonexistent.txt')), undefined)

// 清理临时文件
fs.rmSync(tmpDir, { recursive: true })

// ==================== 纯函数分支 ====================
console.log('\n\n========== 内部纯函数分支 ==========')

// 通过间接方式测试 collapseUnicodeWhitespace
// 创建一个文件用 U+202F 命名，然后尝试用普通空格查找
const specialDir = path.join(process.cwd(), '.tmp_test_unicode')
fs.mkdirSync(specialDir, { recursive: true })
const narrowSpace = '\u202F'
const specialFile = path.join(specialDir, `test${narrowSpace}PM.txt`)
fs.writeFileSync(specialFile, 'hello')

console.log('\n[分支3] 窄不换行空格变体')
const result = resolveExistingFilePath(path.join(specialDir, 'test PM.txt'))
check('narrow space resolved', result !== undefined, true)

// 清理
fs.rmSync(specialDir, { recursive: true })

// ==================== SUMMARY ====================
console.log(`\n\n━━━ pathResolution.ts 闭环结果: ${pass} pass, ${fail} fail ━━━`)
if (fail > 0) { console.log('❌ 有失败，需要修改程序\n'); process.exit(1) }
console.log('✅ 全部通过\n')
