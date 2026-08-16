/**
 * stringify.ts 闭环测试
 */

import {
  stringifyValue,
  stringifyDict,
  commaList,
  sanitizeForPostgres,
  sanitizePostgresStrings,
  batchIterate,
  shouldExcludeFile,
  cleanPath,
  envVarIsSet,
  getFromDictOrEnv,
  isValidUUID,
  urlSafeString,
  hashStringSha256,
  extractJsonObjects,
  parseDatetimeUtc,
  toEpochS,
  nowEpochS,
  ensureUtc,
  convertDatetimesToStrings,
  cleanJsonContent,
  parsePartialJson,
  isEmpty,
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
check('string', stringifyValue('hello'), 'hello')
check('number', stringifyValue(42), '42')
check('null', stringifyValue(null), 'null')
check('object', stringifyValue({ a: 1, b: 2 }), '\na: 1\nb: 2')
check('array', stringifyValue([1, 'x', null]), '1\nx\nnull')

// ==================== stringifyDict ====================
console.log('\n\n========== stringifyDict 分支 ==========')
const obj = { name: 'test', value: 123 }
check('dict', stringifyDict(obj), 'name: test\nvalue: 123')
check('nested', stringifyDict({ a: { b: 1 } }), 'a: \nb: 1')

// ==================== commaList ====================
console.log('\n\n========== commaList 分支 ==========')
check('simple', commaList(['a', 'b', 'c']), 'a, b, c')
check('single', commaList(['only']), 'only')
check('empty', commaList([]), '')

// ==================== sanitizeForPostgres ====================
console.log('\n\n========== sanitizeForPostgres 分支 ==========')
check('nul removed', sanitizeForPostgres('hello\x00world'), 'helloworld')
check('with replacement', sanitizeForPostgres('a\x00b\x00c', ' '), 'a b c')
check('no nul', sanitizeForPostgres('clean'), 'clean')

// ==================== batchIterate ====================
console.log('\n\n========== batchIterate 分支 ==========')
const batches1 = [...batchIterate(3, [1, 2, 3, 4, 5, 6, 7])]
check('3 batches', JSON.stringify(batches1), '[[1,2,3],[4,5,6],[7]]')
const batches2 = [...batchIterate(3, [1, 2])]
check('partial batch', JSON.stringify(batches2), '[[1,2]]')
const batches3 = [...batchIterate(null, [1, 2, 3])]
check('all at once', JSON.stringify(batches3), '[[1,2,3]]')
const empty = [...batchIterate(3, [])]
check('empty', JSON.stringify(empty), '[]')

// ==================== shouldExcludeFile ====================
console.log('\n\n========== shouldExcludeFile 分支 ==========')
check('exclude node_modules', shouldExcludeFile('src/node_modules/pkg/index.js'), true)
check('exclude .git', shouldExcludeFile('.git/config'), true)
check('exclude .png', shouldExcludeFile('image.png'), true)
check('exclude .gitignore', shouldExcludeFile('.gitignore'), true)
check('exclude .DS_Store', shouldExcludeFile('.DS_Store'), true)
check('keep src file', shouldExcludeFile('src/utils/stringify.ts'), false)
check('keep .ts file', shouldExcludeFile('app.ts'), false)

// ==================== cleanPath ====================
console.log('\n\n========== cleanPath 分支 ==========')
check('strip leading slash', cleanPath('/src/utils/stringify.ts'), 'src/utils/stringify.ts')
check('strip workspace', cleanPath('/workspace/src/app.ts'), 'src/app.ts')
check('strip workspace prefix', cleanPath('workspace/src/app.ts'), 'src/app.ts')
check('plain relative', cleanPath('src/app.ts'), 'src/app.ts')
check('custom workspace', cleanPath('/myws/src/a.ts', '/myws'), 'src/a.ts')

// ==================== envVarIsSet ====================
console.log('\n\n========== envVarIsSet 分支 ==========')
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
check('from dict', getFromDictOrEnv({ api_key: 'abc123' }, 'api_key', 'API_KEY'), 'abc123')
process.env['__TEST_STR_DOC__'] = 'from_env'
check('from env', getFromDictOrEnv({}, 'api_key', '__TEST_STR_DOC__'), 'from_env')
check('default', getFromDictOrEnv({}, 'api_key', '__TEST_STR_DOC2__', 'fallback'), 'fallback')
check('first key', getFromDictOrEnv({ old: 'old_val' }, ['old', 'new'], 'NEW_KEY'), 'old_val')
check('second key', getFromDictOrEnv({ new: 'new_val' }, ['old', 'new'], 'NEW_KEY'), 'new_val')
try {
  getFromDictOrEnv({}, 'missing', 'MISSING_ENV')
  console.log('  ❌ should have thrown')
  fail++
} catch (e) {
  check('throws when missing', (e as Error).message.includes('MISSING_ENV'), true)
}
delete process.env['__TEST_STR_DOC__']

// ==================== isValidUUID ====================
console.log('\n\n========== isValidUUID 分支 ==========')
check('valid uuid', isValidUUID('550e8400-e29b-41d4-a716-446655440000'), true)
check('invalid uuid', isValidUUID('not-a-uuid'), false)
check('empty', isValidUUID(''), false)

// ==================== urlSafeString ====================
console.log('\n\n========== urlSafeString 分支 ==========')
check('spaces', urlSafeString('hello world'), 'hello-world')
check('camelCase', urlSafeString('myVariable'), 'my-variable')
check('snake_case', urlSafeString('my_variable'), 'my-variable')
check('special chars', urlSafeString('hello@world!'), 'helloworld')
check('consecutive dashes', urlSafeString('a--b'), 'a-b')

// ==================== hashStringSha256 ====================
console.log('\n\n========== hashStringSha256 分支 ==========')
const hash1 = hashStringSha256('hello')
check('sha256 length', hash1.length, 64)
check('sha256 deterministic', hashStringSha256('hello'), hash1)
check('sha256 different input', hashStringSha256('world') !== hash1, true)

// ==================== extractJsonObjects ====================
console.log('\n\n========== extractJsonObjects 分支 ==========')
check('one json', extractJsonObjects('text {"a":1} more').length, 1)
check('json content', extractJsonObjects('{"key": "value"}')[0], '{"key": "value"}')
check('nested json', extractJsonObjects('outer {"a":{"b":1}} end').length, 1)
check('two jsons', extractJsonObjects('{"a":1} and {"b":2}').length, 2)
check('no json', extractJsonObjects('plain text').length, 0)

// ==================== 时间工具 ====================
console.log('\n\n========== parseDatetimeUtc / toEpochS / nowEpochS 分支 ==========')
const dt1 = parseDatetimeUtc('2024-01-15T10:30:00Z')
check('parse utc date', dt1.toISOString(), '2024-01-15T10:30:00.000Z')
const dt2 = parseDatetimeUtc('2024-01-15T10:30:00+05:00')
check('parse with tz', dt2.toISOString(), '2024-01-15T05:30:00.000Z')
const epoch = toEpochS('2024-01-15T10:30:00Z')
check('to epoch string', epoch, 1705314600)
const epochNum = toEpochS(1705312200)
check('to epoch number', epochNum, 1705312200)
const now = nowEpochS()
check('now epoch is number', typeof now, 'number')
check('now epoch positive', now > 1700000000, true)

// ==================== ensureUtc ====================
console.log('\n\n========== ensureUtc 分支 ==========')
const utcNow = new Date(Date.UTC(2024, 0, 15, 10, 30, 0))
check('utc unchanged', ensureUtc(utcNow)!.toISOString(), '2024-01-15T10:30:00.000Z')
const localDate = new Date('2024-01-15T10:30:00')
check('local date returned', ensureUtc(localDate)!.toISOString(), localDate.toISOString())
check('null input', ensureUtc(null), null)
check('undefined input', ensureUtc(undefined as unknown as Date | null), null)

// ==================== convertDatetimesToStrings ====================
console.log('\n\n========== convertDatetimesToStrings 分支 ==========')
const dtObj = new Date(Date.UTC(2024, 0, 15, 10, 30, 0))
const converted = convertDatetimesToStrings({ name: 'test', created: dtObj, items: [dtObj, 'str'] })
check('nested date converted', JSON.stringify(converted), JSON.stringify({ name: 'test', created: '2024-01-15T10:30:00.000Z', items: ['2024-01-15T10:30:00.000Z', 'str'] }))
check('plain string unchanged', convertDatetimesToStrings('hello'), 'hello')
check('number unchanged', convertDatetimesToStrings(42), 42)

// ==================== isEmpty ====================
console.log('\n\n========== isEmpty 分支 ==========')
check('null is empty', isEmpty(null), true)
check('undefined is empty', isEmpty(undefined as unknown as string), true)
check('empty string is empty', isEmpty(''), true)
check('non-empty string', isEmpty('hello'), false)
check('empty array', isEmpty([]), true)
check('non-empty array', isEmpty([1]), false)
check('empty object', isEmpty({}), true)
check('non-empty object', isEmpty({ a: 1 }), false)
check('number is not empty', isEmpty(0), false)

// ==================== sanitizePostgresStrings ====================
console.log('\n\n========== sanitizePostgresStrings 分支 ==========')
check('string sanitize', sanitizePostgresStrings('a\x00b'), 'ab')
check('nested dict', JSON.stringify(sanitizePostgresStrings({ a: 'x\x00y', b: [1, 'z\x00w'] })),
  '{"a":"xy","b":[1,"zw"]}')

// ==================== cleanJsonContent ====================
console.log('\n\n========== cleanJsonContent 分支 ==========')
check('plain json', cleanJsonContent('{"key":"value"}'), '{"key": "value"}')
check('json code block', cleanJsonContent('Here: ```json\n{"a":1}\n```'), '{"a":1} ')
check('generic code block', cleanJsonContent('```\n{"b":2}\n```'), '{"b":2}')
check('markdown bold key', cleanJsonContent('*"name"*: "test"'), '"name": "test"')
check('newlines removed', cleanJsonContent('{"a":"line1\nline2"}'), '{"a": "line1 line2"}')
check('nul removed', cleanJsonContent('{"a":"x\x00y"}'), '{"a": "xy"}')
check('escaped quotes in value', cleanJsonContent('{"msg":"say \"hi\" now"}'), '{"msg": "say \\"hi\\" now"}')

// ==================== parsePartialJson ====================
console.log('\n\n========== parsePartialJson 分支 ==========')

console.log('\n[分支8] 完整 JSON 直接解析')
check('valid json', JSON.stringify(parsePartialJson('{"a":1}')), '{"a":1}')

console.log('\n[分支9] 缺失闭合括号')
check('missing close', JSON.stringify(parsePartialJson('{"a":1')), '{"a":1}')

console.log('\n[分支10] 缺失数组闭合')
check('missing array close', JSON.stringify(parsePartialJson('{"items":[1,2,3')), '{"items":[1,2,3]}')

console.log('\n[分支11] 字符串未闭合')
check('unclosed string', JSON.stringify(parsePartialJson('{"msg":"hello')), '{"msg":"hello"}')

// ==================== SUMMARY ====================
console.log(`\n\n━━━ stringify.ts 闭环结果: ${pass} pass, ${fail} fail ━━━`)
if (fail > 0) { console.log('❌ 有失败，需要修改程序\n'); process.exit(1) }
console.log('✅ 全部通过\n')
