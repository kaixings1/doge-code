/**
 * textUtils.ts 闭环测试
 */

import {
  addAffix,
  removeAffix,
  removeComments,
  parseJsonCodeBlock,
  decodeUnicodeEscape,
  splitParagraph,
  truncateAtSentence,
  concatenateEpisodes,
} from './textUtils.js'

let pass = 0, fail = 0

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    console.log(`  OK ${label} => ${a}`)
    pass++
  } else {
    console.log(`  FAIL ${label}`)
    console.log(`     actual : ${a}`)
    console.log(`     expect : ${e}`)
    fail++
  }
}

// ==================== addAffix / removeAffix ====================
console.log('\n== addAffix / removeAffix ==')

console.log('\n[分支1] brace affix')
check('add brace', addAffix('data'), '{data}')
check('add brace explicit', addAffix('data', 'brace'), '{data}')
check('remove brace', removeAffix('{data}'), 'data')

console.log('\n[分支2] url affix')
check('add url', addAffix('hello world', 'url'), '%7Bhello%20world%7D')
check('remove url', removeAffix('%7Bhello%20world%7D', 'url'), 'hello world')

console.log('\n[分支3] none affix')
check('add none', addAffix('plain', 'none'), 'plain')
check('remove none', removeAffix('plain', 'none'), 'plain')

// ==================== removeComments ====================
console.log('\n\n== removeComments ==')

console.log('\n[分支4] 移除 # 注释')
const code1 = 'x = 1  # 这是注释\ny = 2'
check('remove inline comment', removeComments(code1), 'x = 1\ny = 2')

console.log('\n[分支5] 保留字符串中的 #')
const code2 = 's = "hello # not a comment"'
check('hash in string', removeComments(code2), 's = "hello # not a comment"')

console.log('\n[分支6] 空行清理')
const code3 = 'x = 1\n\n# comment\ny = 2\n\n'
check('empty lines removed', removeComments(code3), 'x = 1\ny = 2')

// ==================== decodeUnicodeEscape ====================
console.log('\n\n== decodeUnicodeEscape ==')

console.log('\n[分支10] Unicode 解码')
check('unicode decode', decodeUnicodeEscape('hello\\u4e16\\u754c'), 'hello世界')
check('no escape', decodeUnicodeEscape('plain text'), 'plain text')
check('empty', decodeUnicodeEscape(''), '')

// ==================== splitParagraph ====================
console.log('\n\n== splitParagraph ==')

console.log('\n[分支11] 按句号分割')
const sp1 = splitParagraph('First sentence. Second sentence. Third.', '.,', 2)
check('split by dot', sp1.length, 2)

console.log('\n[分支12] 无分隔符时均分')
const sp2 = splitParagraph('abcdefghij', '', 3)
check('split by count', sp2.length, 3)
check('even split', sp2[0].length + sp2[1].length + sp2[2].length, 10)

// ==================== parseJsonCodeBlock ====================
console.log('\n\n== parseJsonCodeBlock ==')

console.log('\n[分支7] 提取 JSON 代码块')
const md1 = 'Here is data:\n```json\n{"key": "value"}\n```\nEnd.'
const blocks1 = parseJsonCodeBlock(md1)
check('one block', blocks1.length, 1)
check('block content', blocks1[0], '{"key": "value"}')

console.log('\n[分支8] 无 json 代码块')
const md2 = 'plain text here'
check('no block returns text', parseJsonCodeBlock(md2).length, 1)
check('no block content', parseJsonCodeBlock(md2)[0], 'plain text here')

console.log('\n[分支9] 多个 JSON 代码块')
const md3 = '```json\n{"a":1}\n```\n```json\n{"b":2}\n```'
const blocks3 = parseJsonCodeBlock(md3)
check('two blocks', blocks3.length, 2)
check('first block', blocks3[0], '{"a":1}')
check('second block', blocks3[1], '{"b":2}')

// ==================== truncateAtSentence ====================
console.log('\n\n== truncateAtSentence ==')

console.log('\n[分支13] 按句子边界截断')
check('short text unchanged', truncateAtSentence('Hello world', 100), 'Hello world')
check('truncate at period', truncateAtSentence('First sentence. Second sentence. Third.', 25), 'First sentence.')
check('truncate at exclamation', truncateAtSentence('Wow! Really? Yes.', 8), 'Wow!')
check('truncate at question', truncateAtSentence('What? How? Why?', 9), 'What?')
check('no boundary hard cut', truncateAtSentence('NoPunctuationHere', 5), 'NoPun')
check('exact length', truncateAtSentence('Exact.', 6), 'Exact.')

// ==================== concatenateEpisodes ====================
console.log('\n\n== concatenateEpisodes ==')

console.log('\n[分支14] 单剧集直接返回')
const singleEp = [{ content: 'Just one episode', valid_at: '2024-01-01T00:00:00Z' }]
check('single episode', concatenateEpisodes(singleEp), 'Just one episode')

console.log('\n[分支15] 多剧集拼接')
const multiEps = [
  { content: 'First content', valid_at: '2024-01-01T00:00:00Z' },
  { content: 'Second content', valid_at: '2024-01-02T00:00:00Z' },
]
const multiResult = concatenateEpisodes(multiEps)
check('multi episode header 0', multiResult.includes('[Episode 0]'), true)
check('multi episode header 1', multiResult.includes('[Episode 1]'), true)
check('multi episode timestamp', multiResult.includes('2024-01-01T00:00:00Z'), true)
check('multi episode content', multiResult.includes('First content'), true)

console.log('\n[分支16] 无时间戳')
const noTimeEps = [
  { content: 'No timestamp' },
  { content: 'Also no timestamp' },
]
const noTimeResult = concatenateEpisodes(noTimeEps)
check('unknown timestamp fallback', noTimeResult.includes('unknown'), true)

// ==================== SUMMARY ====================
console.log(`\n\ntextUtils: ${pass} pass, ${fail} fail`)
if (fail > 0) process.exit(1)
console.log('ALL PASS')
