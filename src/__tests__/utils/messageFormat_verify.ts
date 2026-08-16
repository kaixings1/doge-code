/**
 * messageFormat.ts 闭环验证 — 每个分支打印 输入/实际/预期
 * 运行: bun run src/__tests__/utils/messageFormat_verify.ts
 */

import {
  detectFormat,
  toOpenAI,
  fromOpenAI,
  anthropicToOpenAI,
  openAIToAnthropic,
  vercelToOpenAI,
  openAIToVercel,
  geminiToOpenAI,
  openAIToGemini,
  extractUserQuery,
  countTurns,
  extractToolCalls,
} from '../../utils/messageFormat.js'

let pass = 0, fail = 0

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    console.log(`  ✅ ${label}`)
    console.log(`     => ${a}`)
    pass++
  } else {
    console.log(`  ❌ ${label}`)
    console.log(`     实际  : ${a}`)
    console.log(`     预期  : ${e}`)
    fail++
  }
}

// ==================== detectFormat 分支 ====================
console.log('\n========== detectFormat 分支 ==========')

console.log('\n[分支1] Gemini: parts 存在且 content 不存在')
check('Gemini parts only', detectFormat([{ role: 'model', parts: [{ text: 'hi' }] }]), 'gemini')

console.log('\n[分支2] Gemini: role === "model"')
check('Gemini role model', detectFormat([{ role: 'model', content: 'hi' }]), 'gemini')

console.log('\n[分支3] OpenAI: tool_calls on assistant')
check('OpenAI tool_calls', detectFormat([{ role: 'assistant', content: null, tool_calls: [] }]), 'openai')

console.log('\n[分支4] OpenAI: role === "tool" with tool_call_id + string content')
check('OpenAI tool role', detectFormat([{ role: 'tool', content: 'result', tool_call_id: '123' }]), 'openai')

console.log('\n[分支5] Vercel: tool-call type in content array')
check('Vercel tool-call', detectFormat([{ role: 'user', content: [{ type: 'tool-call', toolCallId: '123' }] }]), 'vercel')

console.log('\n[分支6] Anthropic: tool_result type in content array')
check('Anthropic tool_result', detectFormat([{ role: 'user', content: [{ type: 'tool_result', tool_use_id: '123' }] }]), 'anthropic')

console.log('\n[分支7] Anthropic: tool_use type in content array')
check('Anthropic tool_use', detectFormat([{ role: 'assistant', content: [{ type: 'tool_use', id: '1', name: 'test', input: {} }] }]), 'anthropic')

console.log('\n[分支8] Anthropic: image with source.type')
check('Anthropic image', detectFormat([{ role: 'user', content: [{ type: 'image', source: { type: 'base64', data: 'x' } }] }]), 'anthropic')

console.log('\n[分支9] 默认: 简单 OpenAI')
check('default OpenAI', detectFormat([{ role: 'user', content: 'hi' }]), 'openai')

// ==================== anthropicToOpenAI ====================
console.log('\n\n========== anthropicToOpenAI ==========')

console.log('\n[user: string]')
const ao1 = anthropicToOpenAI([{ role: 'user', content: 'hello' }])
check('user string passthrough', ao1[0], { role: 'user', content: 'hello' })

console.log('\n[user: content array with text + tool_result]')
const ao2 = anthropicToOpenAI([
  { role: 'user', content: [
    { type: 'text', text: 'hi' },
    { type: 'tool_result', tool_use_id: 't1', content: 'result' },
  ]},
])
check('user: text joined', ao2[0], { role: 'user', content: 'hi' })
check('user: tool_result → tool role', ao2[1], { role: 'tool', content: 'result', tool_call_id: 't1' })

console.log('\n[assistant: string content]')
const ao3 = anthropicToOpenAI([{ role: 'assistant', content: 'reply' }])
check('assistant string passthrough', ao3[0], { role: 'assistant', content: 'reply' })

console.log('\n[assistant: content array with text + tool_use]')
const ao4 = anthropicToOpenAI([
  { role: 'assistant', content: [
    { type: 'text', text: 'hi' },
    { type: 'tool_use', id: '1', name: 'test', input: { q: 'x' } },
  ]},
])
check('assistant: text extracted', ao4[0].content, 'hi')
check('assistant: tool_calls created', ao4[0].tool_calls?.[0]?.function?.name, 'test')
check('assistant: tool args', ao4[0].tool_calls?.[0]?.function?.arguments, '{"q":"x"}')

// ==================== openAIToAnthropic ====================
console.log('\n\n========== openAIToAnthropic ==========')

console.log('\n[user: string]')
const oa1 = openAIToAnthropic([{ role: 'user', content: 'hello' }])
check('user string passthrough', oa1, [{ role: 'user', content: 'hello' }])

console.log('\n[assistant: content + tool_calls]')
const oa2 = openAIToAnthropic([
  { role: 'assistant', content: 'hi', tool_calls: [{ id: '1', type: 'function', function: { name: 'search', arguments: '{"q":"x"}' } }] },
])
check('assistant: text + tool_use blocks', oa2[0], {
  role: 'assistant',
  content: [
    { type: 'text', text: 'hi' },
    { type: 'tool_use', id: '1', name: 'search', input: { q: 'x' } },
  ],
})

console.log('\n[tool role]')
const oa3 = openAIToAnthropic([{ role: 'tool', content: 'result', tool_call_id: 'tc1' }])
check('tool → user with tool_result', oa3[0], { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tc1', content: 'result' }] })

// ==================== round-trip ====================
console.log('\n\n========== round-trip 双向转换 ==========')

const original = [{ role: 'user', content: 'hello' }]
const openaiFmt = toOpenAI(original)
const back = fromOpenAI(openaiFmt, 'openai')
check('OpenAI round-trip', back, original)

// ==================== extractUserQuery ====================
console.log('\n\n========== extractUserQuery 分支 ==========')

console.log('\n[分支1] 字符串 content, 最后一个 user')
check('string last user', extractUserQuery([
  { role: 'user', content: 'first' },
  { role: 'assistant', content: 'reply' },
  { role: 'user', content: 'last' },
]), 'last')

console.log('\n[分支2] content array with text block')
check('text block', extractUserQuery([{ role: 'user', content: [{ type: 'text', text: 'hello' }] }]), 'hello')

console.log('\n[分支3] 无 user message')
check('no user → empty', extractUserQuery([{ role: 'assistant', content: 'hi' }]), '')

// ==================== countTurns ====================
console.log('\n\n========== countTurns ==========')
check('count 2 users', countTurns([
  { role: 'user', content: 'a' },
  { role: 'assistant', content: 'b' },
  { role: 'user', content: 'c' },
]), 2)
check('count 0 users', countTurns([{ role: 'assistant', content: 'hi' }]), 0)

// ==================== extractToolCalls ====================
console.log('\n\n========== extractToolCalls 分支 ==========')

console.log('\n[分支1] OpenAI: tool_calls on assistant')
check('OpenAI tool_calls', extractToolCalls([
  { role: 'assistant', content: null, tool_calls: [{ id: '1', type: 'function', function: { name: 'search', arguments: '{}' } }] },
]), ['search'])

console.log('\n[分支2] Anthropic: tool_use in content array')
check('Anthropic tool_use', extractToolCalls([
  { role: 'assistant', content: [{ type: 'tool_use', name: 'calc', id: '1', input: {} }] },
]), ['calc'])

console.log('\n[分支3] Vercel: tool-call in content array')
check('Vercel tool-call', extractToolCalls([
  { role: 'assistant', content: [{ type: 'tool-call', toolName: 'lookup', toolCallId: 'abc' }] },
]), ['lookup'])

console.log('\n[分支4] 无 tool_calls')
check('no tool calls', extractToolCalls([{ role: 'user', content: 'hi' }]), [])

// ==================== SUMMARY ====================
console.log(`\n\n━━━ messageFormat.ts 闭环结果: ${pass} pass, ${fail} fail ━━━`)
if (fail > 0) { console.log('❌ 有失败，需要修改程序\n'); process.exit(1) }
console.log('✅ 全部通过\n')
