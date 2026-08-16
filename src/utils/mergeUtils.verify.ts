/**
 * mergeUtils.ts 闭环测试
 */

import { mergeDictionaries, mergeParallelSessionStates } from './mergeUtils.js'

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

// ==================== mergeDictionaries ====================
console.log('\n========== mergeDictionaries 分支 ==========')

console.log('\n[分支1] 简单覆盖')
const a1 = { x: 1, y: 2 }
mergeDictionaries(a1, { y: 99, z: 3 })
check('b wins', JSON.stringify(a1), '{"x":1,"y":99,"z":3}')

console.log('\n[分支2] 递归合并')
const a2 = { outer: { a: 1, b: 2 } }
mergeDictionaries(a2, { outer: { b: 99, c: 3 } })
check('nested merge', JSON.stringify(a2), '{"outer":{"a":1,"b":99,"c":3}}')

console.log('\n[分支3] b 的值为非对象覆盖 a 的对象')
const a3 = { data: { a: 1 } }
mergeDictionaries(a3, { data: 'replaced' })
check('scalar overrides dict', JSON.stringify(a3), '{"data":"replaced"}')

console.log('\n[分支4] a 的值为非对象保留')
const a4 = { data: 'original' }
mergeDictionaries(a4, { data: { b: 2 } })
check('dict overrides scalar', JSON.stringify(a4), '{"data":{"b":2}}')

// ==================== mergeParallelSessionStates ====================
console.log('\n\n========== mergeParallelSessionStates 分支 ==========')

console.log('\n[分支5] 合并实际变更')
const original1 = { a: 1, b: 2, c: 3 }
mergeParallelSessionStates(original1, [
  { a: 1, b: 20, d: 4 },
  { a: 1, c: 30, e: 5 },
])
check('only changes applied', JSON.stringify(original1), '{"a":1,"b":20,"c":30,"d":4,"e":5}')

console.log('\n[分支6] 空输入保护')
const original2 = { x: 1 }
mergeParallelSessionStates(original2, [])
check('empty states no change', JSON.stringify(original2), '{"x":1}')

console.log('\n[分支7] 无变更')
const original3 = { x: 1 }
mergeParallelSessionStates(original3, [{ x: 1 }])
check('same value no change', JSON.stringify(original3), '{"x":1}')

// ==================== SUMMARY ====================
console.log(`\n\nmergeUtils: ${pass} pass, ${fail} fail`)
if (fail > 0) process.exit(1)
console.log('ALL PASS')
