/**
 * messageUtils.ts 闭环测试
 */

import {
  fastHash,
  computeMessagesHash,
  computePrefixHash,
  extractUserQuery,
  formatTimestamp,
  parseTimestamp,
  safeJsonLoads,
  safeJsonDumps,
  createMarker,
  createToolDigestMarker,
  createDroppedContextMarker,
  createTruncatedMarker,
  extractMarkers,
} from './messageUtils.js'

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

// ==================== fastHash ====================
console.log('\n========== fastHash 分支 ==========')

console.log('\n[分支1] 相同输入产生相同哈希')
const h1 = fastHash('hello world')
const h2 = fastHash('hello world')
check('deterministic', h1 === h2, true)

console.log('\n[分支2] 不同输入产生不同哈希')
check('different input', fastHash('hello') !== fastHash('world'), true)

console.log('\n[分支3] 默认长度 16')
check('default length 16', fastHash('test').length, 16)

console.log('\n[分支4] 自定义长度')
check('custom length 8', fastHash('test', 8).length, 8)

// ==================== computeMessagesHash ====================
console.log('\n\n========== computeMessagesHash 分支 ==========')

console.log('\n[分支5] 相同消息数组产生相同哈希')
const msgs = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }]
check('messages hash deterministic', computeMessagesHash(msgs) === computeMessagesHash(msgs), true)

console.log('\n[分支6] 空数组')
check('empty array hash', computeMessagesHash([]).length, 16)

// ==================== computePrefixHash ====================
console.log('\n\n========== computePrefixHash 分支 ==========')

console.log('\n[分支7] 纯 system 消息')
const sysMsgs = [
  { role: 'system', content: 'you are helpful' },
  { role: 'user', content: 'hi' },
]
check('prefix with system', computePrefixHash(sysMsgs).length, 16)

console.log('\n[分支8] 无 system 消息')
check('no system messages', computePrefixHash([{ role: 'user', content: 'hi' }]).length, 16)

// ==================== extractUserQuery ====================
console.log('\n\n========== extractUserQuery 分支 ==========')

console.log('\n[分支9] OpenAI 格式')
const openaiMsgs = [
  { role: 'system', content: 'sys' },
  { role: 'user', content: '  what is AI?  ' },
]
check('openai format', extractUserQuery(openaiMsgs), 'what is AI?')

console.log('\n[分支10] Anthropic 格式')
const anthropicMsgs = [
  { role: 'user', content: [{ type: 'text', text: 'hello world' }] },
]
check('anthropic format', extractUserQuery(anthropicMsgs), 'hello world')

console.log('\n[分支11] 无用户消息')
check('no user msg', extractUserQuery([{ role: 'system', content: 'sys' }]), '')

console.log('\n[分支12] 空 content')
check('empty content', extractUserQuery([{ role: 'user', content: '' }]), '')

// ==================== formatTimestamp / parseTimestamp ================
console.log('\n\n========== 时间戳 分支 ==========')

console.log('\n[分支13] 格式化时间戳')
const ts = formatTimestamp(new Date('2025-01-15T10:30:00Z'))
check('format iso8601', ts, '2025-01-15T10:30:00Z')

console.log('\n[分支14] 解析时间戳')
const parsed = parseTimestamp('2025-01-15T10:30:00Z')
// 验证解析正确：移除 Z 后 Date 解析为 UTC 时间
check('parse timestamp utc', parsed.toISOString(), new Date('2025-01-15T10:30:00Z').toISOString())

// ==================== safeJsonLoads / safeJsonDumps ====================
console.log('\n\n========== safeJsonLoads / safeJsonDumps 分支 ==========')

console.log('\n[分支15] 合法 JSON')
const [parsedObj, ok] = safeJsonLoads('{"a":1}')
check('valid json', ok, true)
check('parsed value', (parsedObj as Record<string, number>)?.a, 1)

console.log('\n[分支16] 非法 JSON')
const [badObj, badOk] = safeJsonLoads('not json')
check('invalid json ok', badOk, false)
check('invalid json null', badObj, null)

console.log('\n[分支17] 序列化')
check('dumps compact', safeJsonDumps({ a: 1, b: 'hello' }), '{"a":1,"b":"hello"}')

console.log('\n[分支18] 带缩进')
const indented = safeJsonDumps({ a: 1 }, 2)
check('dumps indented', indented, '{\n  "a": 1\n}')

// ==================== createMarker ====================
console.log('\n\n========== createMarker 分支 ==========')

console.log('\n[分支19] 无属性')
check('simple marker', createMarker('tool_digest'), '<headroom:tool_digest>')

console.log('\n[分支20] 带属性')
check('with attrs', createMarker('dropped_context', { reason: 'token limit', count: '5' }), '<headroom:dropped_context reason="token limit" count="5">')

// ==================== 专用标记函数 ====================
console.log('\n\n========== 专用标记函数 分支 ==========')

console.log('\n[分支21] createToolDigestMarker')
check('tool digest', createToolDigestMarker('abc123'), '<headroom:tool_digest sha256="abc123">')

console.log('\n[分支22] createDroppedContextMarker')
check('dropped context', createDroppedContextMarker('overflow'), '<headroom:dropped_context reason="overflow">')

console.log('\n[分支23] createDroppedContextMarker with count')
check('dropped with count', createDroppedContextMarker('overflow', 10), '<headroom:dropped_context reason="overflow" count="10">')

console.log('\n[分支24] createTruncatedMarker')
check('truncated', createTruncatedMarker(5000, 1000), '<headroom:truncated original="5000" truncated_to="1000">')

// ==================== extractMarkers ====================
console.log('\n\n========== extractMarkers 分支 ==========')

console.log('\n[分支25] 提取单个标记')
const markers1 = extractMarkers('<headroom:tool_digest sha256="abc">some text')
check('single marker', markers1.length, 1)
check('marker type', markers1[0]?.type, 'tool_digest')
check('marker attrs', markers1[0]?.attributes, { sha256: 'abc' })

console.log('\n[分支26] 提取多个标记')
const markers2 = extractMarkers('<headroom:a x="1"><headroom:b y="2">')
check('two markers', markers2.length, 2)
check('first type', markers2[0]?.type, 'a')
check('second type', markers2[1]?.type, 'b')

console.log('\n[分支27] 无标记')
check('no markers', extractMarkers('plain text').length, 0)

console.log('\n[分支28] 空字符串')
check('empty string', extractMarkers('').length, 0)

// ==================== SUMMARY ====================
console.log(`\n\n━━━ messageUtils.ts 闭环结果: ${pass} pass, ${fail} fail ━━━`)
if (fail > 0) { console.log('❌ 有失败，需要修改程序\n'); process.exit(1) }
console.log('✅ 全部通过\n')
