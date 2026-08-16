/**
 * stringify.ts 闭环测试
 */

import {
  stringifyValue,
  stringifyDict,
  commaList,
  sanitizeForPostgres,
  batchIterate,
  shouldExcludeFile,
  cleanPath,
  envVarIsSet,
  getFromDictOrEnv,
} from './stringify.js'

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

// ==================== stringifyValue ====================
console.log('\n========== stringifyValue 分支 ==========')

console.log('\n[分支1] 字符串原样返回')
check('string', stringifyValue('hello'), 'hello')

console.log('\n[分支2] 数字')
check('number', stringifyValue(42), '42')

console.log('\n[分支3] null')
check('null', stringifyValue(null), 'null')

console.log('\n[分支4] object')
check('object', stringifyValue({ a: 1, b: 2 }), '\na: 1\nb: 2')

console.log('\n[分支5] array')
check('array', stringifyValue([1, 'x', null]), '1\nx\nnull')

// ==================== stringifyDict ====================
console.log('\n\n========== stringifyDict 分支 ==========')

console.log('\n[分支6] 普通对象')
const obj = { name: 'test', value: 123 }
check('dict', stringifyDict(obj), 'name: test\nvalue: 123')

console.log('\n[分支7] 嵌套对象')
check('nested', stringifyDict({ a: { b: 1 } }), 'a: \nb: 1')

// ==================== commaList ====================
console.log('\n\n========== commaList 分支 ==========')

console.log('\n[分支8] 逗号分隔')
check('simple', commaList(['a', 'b', 'c']), 'a, b, c')
check('single', commaList(['only']), 'only')
check('empty', commaList([]), '')

// ==================== sanitizeForPostgres ====================
console.log('\n\n========== sanitizeForPostgres 分支 ==========')

console.log('\n[分支9] 移除 NUL 字节')
check('nul removed', sanitizeForPostgres('hello\x00world'), 'helloworld')
check('with replacement', sanitizeForPostgres('a\x00b\x00c', ' '), 'a b c')
check('no nul', sanitizeForPostgres('clean'), 'clean')

// ==================== batchIterate ====================
console.log('\n\n========== batchIterate 分支 ==========')

console.log('\n[分支10] 分批')
const batches1 = [...batchIterate(3, [1, 2, 3, 4, 5, 6, 7])]
check('3 batches', JSON.stringify(batches1), '[[1,2,3],[4,5,6],[7]]')

const batches2 = [...batchIterate(3, [1, 2])]
check('partial batch', JSON.stringify(batches2), '[[1,2]]')

console.log('\n[分支11] size=null')
const batches3 = [...batchIterate(null, [1, 2, 3])]
check('all at once', JSON.stringify(batches3), '[[1,2,3]]')

const empty = [...batchIterate(3, [])]
check('empty', JSON.stringify(empty), '[]')

// ==================== shouldExcludeFile ====================
console.log('\n\n========== shouldExcludeFile 分支 ==========')

console.log('\n[分支12] 排除判断')
check('exclude node_modules', shouldExcludeFile('src/node_modules/pkg/index.js'), true)
check('exclude .git', shouldExcludeFile('.git/config'), true)
check('exclude .png', shouldExcludeFile('image.png'), true)
check('exclude .gitignore', shouldExcludeFile('.gitignore'), true)
check('exclude .DS_Store', shouldExcludeFile('.DS_Store'), true)
check('keep src file', shouldExcludeFile('src/utils/stringify.ts'), false)
check('keep .ts file', shouldExcludeFile('app.ts'), false)

// ==================== cleanPath ====================
console.log('\n\n========== cleanPath 分支 ==========')

console.log('\n[分支13] 路径清理')
check('strip leading slash', cleanPath('/src/utils/stringify.ts'), 'src/utils/stringify.ts')
check('strip workspace', cleanPath('/workspace/src/app.ts'), 'src/app.ts')
check('strip workspace prefix', cleanPath('workspace/src/app.ts'), 'src/app.ts')
check('plain relative', cleanPath('src/app.ts'), 'src/app.ts')
check('custom workspace', cleanPath('/myws/src/a.ts', '/myws'), 'src/a.ts')

// ==================== envVarIsSet ====================
console.log('\n\n========== envVarIsSet 分支 ==========')

console.log('\n[分支14] 环境变量判断')
check('unset', envVarIsSet('__NONEXISTENT_VAR_12345__'), false)

process.env['__TEST_STR_DOC__'] = ''
check('empty string', envVarIsSet('__TEST_STR_DOC__'), false)

process.env['__TEST_STR_DOC__'] = '0'
check('zero', envVarIsSet('__TEST_STR_DOC__'), false)

process.env['__TEST_STR_DOC__'] = 'false'
check('false', envVarIsSet('__TEST_STR_DOC__'), false)

process.env['__TEST_STR_DOC__'] = '1'
check('one', envVarIsSet('__TEST_STR_DOC__'), true)

process.env['__TEST_STR_DOC__'] = 'production'
check('production', envVarIsSet('__TEST_STR_DOC__'), true)

delete process.env['__TEST_STR_DOC__']

// ==================== getFromDictOrEnv ====================
console.log('\n\n========== getFromDictOrEnv 分支 ==========')

console.log('\n[分支15] 从 dict 获取')
check('from dict', getFromDictOrEnv({ api_key: 'abc123' }, 'api_key', 'API_KEY'), 'abc123')

console.log('\n[分支16] 从环境变量获取')
process.env['__TEST_STR_DOC__'] = 'from_env'
check('from env', getFromDictOrEnv({}, 'api_key', '__TEST_STR_DOC__'), 'from_env')

console.log('\n[分支17] 默认值')
check('default', getFromDictOrEnv({}, 'api_key', '__TEST_STR_DOC2__', 'fallback'), 'fallback')

console.log('\n[分支18] 多 key 查找')
check('first key', getFromDictOrEnv({ old: 'old_val' }, ['old', 'new'], 'NEW_KEY'), 'old_val')
check('second key', getFromDictOrEnv({ new: 'new_val' }, ['old', 'new'], 'NEW_KEY'), 'new_val')

console.log('\n[分支19] 错误')
try {
  getFromDictOrEnv({}, 'missing', 'MISSING_ENV')
  console.log('  ❌ should have thrown')
  fail++
} catch (e) {
  check('throws when missing', (e as Error).message.includes('MISSING_ENV'), true)
}

delete process.env['__TEST_STR_DOC__']

// ==================== SUMMARY ====================
console.log(`\n\n━━━ stringify.ts 闭环结果: ${pass} pass, ${fail} fail ━━━`)
if (fail > 0) { console.log('❌ 有失败，需要修改程序\n'); process.exit(1) }
console.log('✅ 全部通过\n')
