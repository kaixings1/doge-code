/**
 * headers.ts 闭环测试
 */

import { parseKeyPairsIntoRecord } from './headers.js'

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

// ==================== parseKeyPairsIntoRecord 分支 ====================
console.log('\n========== parseKeyPairsIntoRecord 分支 ==========')

console.log('\n[分支1] undefined → 空对象')
check('undefined', parseKeyPairsIntoRecord(undefined), {})

console.log('\n[分支2] 空字符串 → 空对象')
check('empty string', parseKeyPairsIntoRecord(''), {})

console.log('\n[分支3] 单对 key=value')
check('single pair', parseKeyPairsIntoRecord('Content-Type=text/html'), { 'Content-Type': 'text/html' })

console.log('\n[分支4] 多对 key=value')
check('multiple pairs', parseKeyPairsIntoRecord('a=1,b=2'), { 'a': '1', 'b': '2' })

console.log('\n[分支5] URL 编码值')
check('url encoded', parseKeyPairsIntoRecord('key=hello%20world'), { 'key': 'hello world' })

console.log('\n[分支6] 空 key → 跳过')
check('empty key skipped', parseKeyPairsIntoRecord('=value'), {})

console.log('\n[分支7] 无等号 → 跳过')
check('no equals skipped', parseKeyPairsIntoRecord('justtext'), {})

console.log('\n[分支8] 等号在开头 → 跳过')
check('leading equals skipped', parseKeyPairsIntoRecord('=value'), {})

console.log('\n[分支9] 无效百分号编码 → 静默跳过')
check('invalid encoding skipped', parseKeyPairsIntoRecord('key=%ZZ, good=ok'), { 'good': 'ok' })

console.log('\n[分支10] 带空格的 key=value')
check('spaces trimmed', parseKeyPairsIntoRecord('  key  =  value  '), { 'key': 'value' })

// ==================== SUMMARY ====================
console.log(`\n\n━━━ headers.ts 闭环结果: ${pass} pass, ${fail} fail ━━━`)
if (fail > 0) { console.log('❌ 有失败，需要修改程序\n'); process.exit(1) }
console.log('✅ 全部通过\n')
