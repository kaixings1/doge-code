/**
 * fileOps.ts 闭环测试
 */

import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import {
  rmdirRecursive,
  deleteFilesInDir,
  deleteFromFs,
} from './fileOps.js'
import { readJsonFile, writeJsonFile } from './jsonIO.js'

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

const TMP = join(tmpdir(), 'fileOps-test-' + Date.now())

function makeDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

function writeFile(path: string, content: string): void {
  makeDir(dirname(path))
  writeFileSync(path, content, 'utf8')
}

function cleanup(path: string): void {
  try { rmdirRecursive(path) } catch {}
}

// ==================== rmdirRecursive ====================
console.log('\n========== rmdirRecursive 分支 ==========')

// 清理之前可能存在的测试目录
cleanup(TMP)

check('nonexistent path', rmdirRecursive(join(TMP, 'nonexistent')), true)

makeDir(join(TMP, 'testdir'))
check('existing dir', rmdirRecursive(join(TMP, 'testdir')), true)

writeFile(join(TMP, 'file.txt'), 'hello')
check('existing file', rmdirRecursive(join(TMP, 'file.txt')), true)

// 递归删除带内容的目录
makeDir(join(TMP, 'subdir', 'nested'))
writeFile(join(TMP, 'subdir', 'nested', 'file.txt'), 'nested')
check('nested dir', rmdirRecursive(join(TMP, 'subdir')), true)

// ==================== deleteFilesInDir ====================
console.log('\n========== deleteFilesInDir 分支 ==========')

makeDir(join(TMP, 'keepdir', 'sub'))
writeFile(join(TMP, 'keepdir', 'file1.txt'), 'a')
writeFile(join(TMP, 'keepdir', 'sub', 'file2.txt'), 'b')
deleteFilesInDir(join(TMP, 'keepdir'))
check('dir still exists', existsSync(join(TMP, 'keepdir')), true)
check('file1 removed', existsSync(join(TMP, 'keepdir', 'file1.txt')), false)
check('sub removed', existsSync(join(TMP, 'keepdir', 'sub')), false)

// ==================== deleteFromFs ====================
console.log('\n========== deleteFromFs 分支 ==========')

makeDir(join(TMP, 'deldir'))
writeFile(join(TMP, 'deldir', 'f.txt'), 'x')
check('delete dir', deleteFromFs(join(TMP, 'deldir')), true)
check('dir gone', existsSync(join(TMP, 'deldir')), false)

writeFile(join(TMP, 'delfile.txt'), 'y')
check('delete file', deleteFromFs(join(TMP, 'delfile.txt')), true)
check('file gone', existsSync(join(TMP, 'delfile.txt')), false)
check('nonexistent', deleteFromFs(join(TMP, 'noexist')), true)

// ==================== readJsonFile / writeJsonFile ====================
console.log('\n========== readJsonFile / writeJsonFile 分支 ==========')

const jsonDir = join(TMP, 'jsontest')
makeDir(jsonDir)

const testData = { name: 'test', count: 42, nested: { a: 1 } }
writeJsonFile(join(jsonDir, 'data.json'), testData)
check('write then read', JSON.stringify(readJsonFile(join(jsonDir, 'data.json'))), JSON.stringify(testData))

check('nonexistent returns null', readJsonFile(join(jsonDir, 'noexist.json')), null)

// Date 序列化
const dateData = { created: new Date('2024-01-15T10:30:00Z') }
writeJsonFile(join(jsonDir, 'date.json'), dateData)
const readDate = readJsonFile(join(jsonDir, 'date.json')) as Record<string, string>
check('date serialized', readDate.created, '2024-01-15T10:30:00.000Z')

// 缩进
writeJsonFile(join(jsonDir, 'pretty.json'), { a: 1 }, 2)
const pretty = readFileSync(join(jsonDir, 'pretty.json'), 'utf8')
check('indent 2', pretty.includes('  "a"'), true)

// ==================== cleanup ====================
cleanup(TMP)

// ==================== SUMMARY ====================
console.log(`\n\n━━━ fileOps.ts 闭环结果: ${pass} pass, ${fail} fail ━━━`)
if (fail > 0) { console.log('❌ 有失败，需要修改程序\n'); process.exit(1) }
console.log('✅ 全部通过\n')
