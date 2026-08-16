/**
 * strictFormatter.ts 闭环测试
 */

import { StrictFormatter } from './strictFormatter.js'

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

const formatter = new StrictFormatter()

// ==================== format ====================
console.log('\n========== format 分支 ==========')

console.log('\n[分支1] 具名参数替换')
check('basic', formatter.format('Hello, {name}!', { name: 'World' }), 'Hello, World!')

console.log('\n[分支2] 多个占位符')
check('multi', formatter.format('{greeting}, {name}!', { greeting: 'Hi', name: 'Alice' }), 'Hi, Alice!')

console.log('\n[分支3] 值非字符串自动转换')
check('number value', formatter.format('Count: {n}', { n: 42 }), 'Count: 42')

console.log('\n[分支4] 缺失变量抛错')
try {
  formatter.format('Hello, {name}!', {})
  console.log('  ❌ should have thrown')
  fail++
} catch (e) {
  check('throws on missing', (e as Error).message.includes('name'), true)
}

// ==================== validateInputVariables ====================
console.log('\n\n========== validateInputVariables 分支 ==========')

console.log('\n[分支5] 验证通过')
formatter.validateInputVariables('Hello, {name}!', ['name'])
console.log('  ✅ valid passes')

console.log('\n[分支6] 验证失败')
try {
  formatter.validateInputVariables('Hello, {name}!', ['other'])
  console.log('  ❌ should have thrown')
  fail++
} catch (e) {
  check('throws on missing var', (e as Error).message.includes('name'), true)
}

// ==================== SUMMARY ====================
console.log(`\n\nstrictFormatter: ${pass} pass, ${fail} fail`)
if (fail > 0) process.exit(1)
console.log('ALL PASS')
