/**
 * jsonRepair.ts 闭环测试 — 在源代码中嵌入测试，运行后比较输出
 */

import { parseJsonStream, safeJsonStringify, maskSecret } from './jsonRepair.js'

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

// ==================== parseJsonStream 分支 ====================
console.log('\n========== parseJsonStream 分支 ==========')

console.log('\n[分支1] typeof input !== "string" → passthrough')
check('number passthrough', parseJsonStream(42), 42)
check('null passthrough', parseJsonStream(null), null)

console.log('\n[分支2] 非 { 或 [ 开头 → passthrough')
check('plain string', parseJsonStream('hello'), 'hello')
check('empty string', parseJsonStream(''), '')

console.log('\n[分支3] 有效 JSON → JSON.parse 成功')
check('valid object', parseJsonStream('{"a":1}'), { a: 1 })
check('valid array', parseJsonStream('[1,2,3]'), [1, 2, 3])
check('nested object', parseJsonStream('{"x":{"y":2}}'), { x: { y: 2 } })

console.log('\n[分支4] 无效 JSON → repairBareObjectValue')
check('bare object repair', parseJsonStream('{"name": hello}'), { name: 'hello' })
check('bare with spaces', parseJsonStream('{"key":  value  }'), { key: 'value' })

console.log('\n[分支5] 已合法 JSON token → 不 repair')
check('true not repaired', parseJsonStream('{"a": true}'), { a: true })
check('false not repaired', parseJsonStream('{"a": false}'), { a: false })
check('null not repaired', parseJsonStream('{"a": null}'), { a: null })
check('number not repaired', parseJsonStream('{"a": 42}'), { a: 42 })
check('string value not repaired', parseJsonStream('{"a": "b"}'), { a: 'b' })
check('object value not repaired', parseJsonStream('{"a": {}}'), { a: {} })
check('array value not repaired', parseJsonStream('{"a": []}'), { a: [] })

console.log('\n[分支6] 所有策略失败 → 返回原字符串')
check('total failure returns original', parseJsonStream('{"broken":'), '{"broken":')

// ==================== safeJsonStringify 分支 ====================
console.log('\n\n========== safeJsonStringify 分支 ==========')

console.log('\n[分支1] 普通对象')
check('simple object', safeJsonStringify({ a: 1, b: 'hello' }), '{"a":1,"b":"hello"}')

console.log('\n[分支2] bigint')
check('bigint', safeJsonStringify({ n: 9007199254740991n }), '{"n":"9007199254740991"}')

console.log('\n[分支3] 循环引用')
const circularObj: Record<string, unknown> = { a: 1 }
circularObj.self = circularObj
check('circular ref', safeJsonStringify(circularObj), '{"a":1,"self":"[Circular]"}')

console.log('\n[分支4] null/undefined')
check('null → "null"', safeJsonStringify(null), 'null')
check('undefined → "null"', safeJsonStringify(undefined), 'null')

console.log('\n[分支5] function → "null"')
check('function', safeJsonStringify(() => {}), 'null')

console.log('\n[分支6] 数组')
check('array', safeJsonStringify([1, 2, 3]), '[1,2,3]')

console.log('\n[分支7] 空对象')
check('empty object', safeJsonStringify({}), '{}')

// ==================== maskSecret 分支 ====================
console.log('\n\n========== maskSecret 分支 ==========')

console.log('\n[分支1] value.length <= 8 → ****')
check('3 chars → ****', maskSecret('abc'), '****')
check('8 chars → ****', maskSecret('12345678'), '****')

console.log('\n[分支2] value.length > 8 → 保留首4 + ... + 尾4')
check('9 chars', maskSecret('123456789'), '1234...6789')
check('long secret', maskSecret('sk-ant-abc123xyz'), 'sk-a...3xyz')
check('16 chars', maskSecret('abcdefghijklmnop'), 'abcd...mnop')
check('10 chars', maskSecret('abcdefghij'), 'abcd...ghij')

// ==================== SUMMARY ====================
console.log(`\n\n━━━ jsonRepair.ts 闭环结果: ${pass} pass, ${fail} fail ━━━`)
if (fail > 0) { console.log('❌ 有失败，需要修改程序\n'); process.exit(1) }
console.log('✅ 全部通过\n')
