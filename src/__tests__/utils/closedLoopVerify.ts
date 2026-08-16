/**
 * 闭环验证脚本 — 每个 check 打印 输入/预期/实际，运行后直接看输出修代码
 * 运行: bun run src/__tests__/utils/closedLoopVerify.ts
 */

import {
  looksLikeHtml,
  slimdownHtml,
} from '../../utils/html.js'

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

import {
  parseJsonStream,
  safeJsonStringify,
  maskSecret,
} from '../../utils/jsonRepair.js'

import {
  getShellKind,
  getShellInvocation,
} from '../../utils/shellInvocation.js'

let passed = 0
let failed = 0

function check(label: string, actual: unknown, expected: unknown) {
  const actualStr = JSON.stringify(actual)
  const expectedStr = JSON.stringify(expected)
  const ok = actualStr === expectedStr
  if (ok) {
    console.log(`  ✅ ${label}`)
    passed++
  } else {
    console.log(`  ❌ ${label}`)
    console.log(`     输入实际值  : ${actualStr}`)
    console.log(`     预期值      : ${expectedStr}`)
    failed++
  }
}

function section(name: string) {
  console.log(`\n━━━ ${name} ━━━`)
}

// ==================== html.ts ====================
section('looksLikeHtml')
check('full HTML document', looksLikeHtml('<!DOCTYPE html><html><body>hi</body></html>'), true)
check('HTML fragment <div>', looksLikeHtml('<div>hello</div>'), true)
check('HTML fragment <p>', looksLikeHtml('<p>paragraph</p>'), true)
check('plain text', looksLikeHtml('just plain text'), false)
check('empty string', looksLikeHtml(''), false)

section('slimdownHtml')
check('removes svg', slimdownHtml('<svg xmlns="http://www.w3.org/2000/svg"></svg><div>text</div>'), '<div>text</div>')
check('removes img', slimdownHtml('<img src="photo.jpg" alt="photo"><p>content</p>'), '<p>content</p>')
check('removes data URI', slimdownHtml('<a href="data:text/html,test">link</a>'), '<a>link</a>')
check('keeps href only', slimdownHtml('<a href="/link" class="btn" id="main">text</a>'), '<a href="/link">text</a>')
check('empty input', slimdownHtml(''), '')

// ==================== messageFormat.ts ====================
section('detectFormat')
check('OpenAI simple', detectFormat([{ role: 'user', content: 'hi' }]), 'openai')
check('OpenAI tool_calls', detectFormat([{ role: 'assistant', content: null, tool_calls: [] }]), 'openai')
check('OpenAI tool role', detectFormat([{ role: 'tool', content: 'result', tool_call_id: '123' }]), 'openai')
check('Anthropic tool_result', detectFormat([{ role: 'user', content: [{ type: 'tool_result', tool_use_id: '123' }] }]), 'anthropic')
check('Anthropic tool_use', detectFormat([{ role: 'assistant', content: [{ type: 'tool_use', id: '1', name: 'test', input: {} }] }]), 'anthropic')
check('Vercel tool-call', detectFormat([{ role: 'user', content: [{ type: 'tool-call', toolCallId: '123' }] }]), 'vercel')
check('Gemini parts (model)', detectFormat([{ role: 'model', parts: [{ text: 'hi' }] }]), 'gemini')
check('Gemini parts (user)', detectFormat([{ role: 'user', parts: [{ text: 'hi' }] }]), 'gemini')

section('anthropicToOpenAI')
const anthropicMsgs = [
  { role: 'user', content: 'hello' },
  { role: 'assistant', content: [{ type: 'text', text: 'hi' }, { type: 'tool_use', id: '1', name: 'test', input: {} }] },
]
const aoResult = anthropicToOpenAI(anthropicMsgs)
check('Anthropic→OpenAI: user string preserved', aoResult[0], { role: 'user', content: 'hello' })
check('Anthropic→OpenAI: assistant text', aoResult[1].content, 'hi')
check('Anthropic→OpenAI: tool_calls name', aoResult[1].tool_calls?.[0]?.function?.name, 'test')

section('openAIToAnthropic round-trip')
const openaiMsgs = [{ role: 'user', content: 'hello' }]
const oaResult = openAIToAnthropic(openaiMsgs)
check('OpenAI→Anthropic passthrough', oaResult, [{ role: 'user', content: 'hello' }])

section('vercelToOpenAI')
const vercelMsgs = [
  { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'abc', toolName: 'search', input: { q: 'test' } }] },
]
const voResult = vercelToOpenAI(vercelMsgs)
check('Vercel→OpenAI: tool name', voResult[0].tool_calls?.[0]?.function?.name, 'search')

section('geminiToOpenAI')
const geminiMsgs = [{ role: 'model', parts: [{ text: 'hi' }] }]
const goResult = geminiToOpenAI(geminiMsgs)
check('Gemini→OpenAI: role→assistant', goResult[0].role, 'assistant')
check('Gemini→OpenAI: text', goResult[0].content, 'hi')

section('OpenAI round-trip identity')
const roundTrip = fromOpenAI(toOpenAI([{ role: 'user', content: 'hello' }]), 'openai')
check('round-trip identity', roundTrip, [{ role: 'user', content: 'hello' }])

section('extractUserQuery')
check('string last user', extractUserQuery([{ role: 'user', content: 'first' }, { role: 'assistant', content: 'reply' }, { role: 'user', content: 'last' }]), 'last')
check('text block', extractUserQuery([{ role: 'user', content: [{ type: 'text', text: 'hello' }] }]), 'hello')
check('no user', extractUserQuery([{ role: 'assistant', content: 'hi' }]), '')

section('countTurns')
check('count user msgs', countTurns([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }]), 2)

section('extractToolCalls')
check('OpenAI tool_calls', extractToolCalls([{ role: 'assistant', content: null, tool_calls: [{ id: '1', type: 'function', function: { name: 'search', arguments: '{}' } }] }]), ['search'])
check('Anthropic tool_use', extractToolCalls([{ role: 'assistant', content: [{ type: 'tool_use', name: 'calc', id: '1', input: {} }] }]), ['calc'])
check('Vercel tool-call', extractToolCalls([{ role: 'assistant', content: [{ type: 'tool-call', toolName: 'lookup', toolCallId: 'abc' }] }]), ['lookup'])

// ==================== jsonRepair.ts ====================
section('parseJsonStream')
check('valid object', parseJsonStream('{"a":1}'), { a: 1 })
check('valid array', parseJsonStream('[1,2,3]'), [1, 2, 3])
check('non-JSON → as-is', parseJsonStream('hello'), 'hello')
check('empty string', parseJsonStream(''), '')
check('non-string passthrough', parseJsonStream(42), 42)
check('bare object repair', parseJsonStream('{"name": hello}'), { name: 'hello' })
check('true not repaired', parseJsonStream('{"a": true}'), { a: true })
check('null not repaired', parseJsonStream('{"a": null}'), { a: null })

section('safeJsonStringify')
check('simple', safeJsonStringify({ a: 1, b: 'hello' }), '{"a":1,"b":"hello"}')
check('bigint', safeJsonStringify({ n: 9007199254740991n }), '{"n":"9007199254740991"}')
const circularObj: Record<string, unknown> = { a: 1 }
circularObj.self = circularObj
check('circular', safeJsonStringify(circularObj), '{"a":1,"self":"[Circular]"}')
check('null→"null"', safeJsonStringify(null), 'null')
check('undefined→"null"', safeJsonStringify(undefined), 'null')
check('function→"null"', safeJsonStringify(() => {}), 'null')

section('maskSecret')
check('abc→****', maskSecret('abc'), '****')
check('8 chars→****', maskSecret('12345678'), '****')
check('9 chars', maskSecret('123456789'), '1234...6789')
check('sk-ant', maskSecret('sk-ant-abc123xyz'), 'sk-a...3xyz')
check('16 chars', maskSecret('abcdefghijklmnop'), 'abcd...mnop')

// ==================== shellInvocation.ts ====================
section('getShellKind')
check('powershell', getShellKind('powershell'), 'powershell')
check('powershell.exe', getShellKind('powershell.exe'), 'powershell')
check('pwsh', getShellKind('pwsh'), 'powershell')
check('pwsh.exe', getShellKind('pwsh.exe'), 'powershell')
check('full path', getShellKind('C:\\Program Files\\PowerShell\\pwsh.exe'), 'powershell')
check('cmd', getShellKind('cmd'), 'cmd')
check('cmd.exe', getShellKind('cmd.exe'), 'cmd')
check('wsl', getShellKind('wsl'), 'wsl')
check('wsl.exe', getShellKind('wsl.exe'), 'wsl')
check('bash→posix', getShellKind('bash'), 'posix')
check('/bin/bash→posix', getShellKind('/bin/bash'), 'posix')
check('zsh→posix', getShellKind('zsh'), 'posix')

section('getShellInvocation')
const psInv = getShellInvocation('powershell', 'echo hello')
check('PS args[0]', psInv.args[0], '-NoProfile')
check('PS args[2]', psInv.args[2], '-Command')
check('PS has input', psInv.input, 'echo hello')

const cmdInv = getShellInvocation('cmd', 'echo hello')
check('cmd args', cmdInv.args, ['/d', '/s', '/c', 'echo hello'])
check('cmd no input', cmdInv.input, undefined)

const wslInv = getShellInvocation('wsl', 'echo hello')
check('wsl args', wslInv.args, ['bash', '-c', 'echo hello'])

const posixInv = getShellInvocation('bash', 'echo hello')
check('posix args', posixInv.args, ['-c', 'echo hello'])

// ==================== SUMMARY ====================
console.log(`\n━━━ SUMMARY ━━━`)
console.log(`  passed: ${passed}`)
console.log(`  failed: ${failed}`)
console.log(`  total:  ${passed + failed}`)
if (failed > 0) {
  console.log(`\n  ❌ ${failed} cases FAILED — 需要修改程序`)
  process.exit(1)
} else {
  console.log(`\n  ✅ ALL ${passed} cases PASSED`)
  process.exit(0)
}
