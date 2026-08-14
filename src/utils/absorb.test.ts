import { absorb, absorbLines, absorbText, getSessionCompressor } from './absorb.ts'

let pass = 0
let fail = 0

function assert(name: string, actual: string, expected: string) {
  if (actual === expected) {
    console.log('  [PASS] ' + name)
    pass++
  } else {
    console.log('  [FAIL] ' + name)
    fail++
  }
}

console.log('=== absorb 测试 ===')

assert('重复段落', absorb('hello world\n\nhello world\n\nhello world'), 'hello world')
assert('重复代码块', absorb('function foo() {}\n\nfunction foo() {}\n\nfunction foo() {}'), 'function foo() {}')
assert('保留非重复', absorb('foo\n\nbar\n\nbaz'), 'foo\n\nbar\n\nbaz')
assert('空字符串', absorb(''), '')
assert('行级吸收', absorbLines('line1\nline1\nline1\nline2\nline2\nline2', 3), 'line1\nline1\nline2\nline2')

// SessionCompressor 缓存
{
  const compressor = getSessionCompressor()
  const text = 'tool definition with parameters'
  const result = compressor.feed(text)
  if (result.length < text.length) {
    console.log('  [PASS] SessionCompressor 缓存')
    pass++
  } else {
    console.log('  [FAIL] SessionCompressor 缓存')
    fail++
  }
}

// 超长文本跳过
{
  const longText = 'x'.repeat(600_000)
  const result = absorb(longText)
  if (result === longText) {
    console.log('  [PASS] 超长文本跳过(600KB)')
    pass++
  } else {
    console.log('  [FAIL] 超长文本跳过')
    fail++
  }
}

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed')
if (fail > 0) process.exit(1)
