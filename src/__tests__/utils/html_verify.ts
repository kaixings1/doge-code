/**
 * html.ts 闭环验证 — 每个 case 打印 输入/实际输出/预期输出
 * 运行: bun run src/__tests__/utils/html_verify.ts
 */

import { looksLikeHtml, slimdownHtml } from '../../utils/html.js'

let pass = 0, fail = 0

function verify(label: string, fn: () => unknown, expected: unknown) {
  const actual = fn()
  const actualStr = typeof actual === 'string' ? actual : JSON.stringify(actual)
  const expectedStr = typeof expected === 'string' ? expected : JSON.stringify(expected)
  if (actualStr === expectedStr) {
    console.log(`  ✅ ${label}`)
    console.log(`     实际输出: ${actualStr}`)
    pass++
  } else {
    console.log(`  ❌ ${label}`)
    console.log(`     输入函数: ${fn.toString().slice(0, 60)}...`)
    console.log(`     实际输出: ${actualStr}`)
    console.log(`     预期输出: ${expectedStr}`)
    fail++
  }
}

console.log('\n========== looksLikeHtml 分支覆盖 ==========')

// 分支1: DOCTYPE
console.log('\n[分支1] 输入含 <!DOCTYPE html>')
verify('DOCTYPE → true', () => looksLikeHtml('<!DOCTYPE html><html></html>'), true)

// 分支2: <html
console.log('\n[分支2] 输入含 <html')
verify('html tag → true', () => looksLikeHtml('<html><body>x</body></html>'), true)

// 分支3: <head
console.log('\n[分支3] 输入含 <head')
verify('head tag → true', () => looksLikeHtml('<head><title>x</title></head>'), true)

// 分支4: <body
console.log('\n[分支4] 输入含 <body')
verify('body tag → true', () => looksLikeHtml('<body>content</body>'), true)

// 分支5: <div
console.log('\n[分支5] 输入含 <div')
verify('div tag → true', () => looksLikeHtml('<div>hello</div>'), true)

// 分支6: <p>
console.log('\n[分支6] 输入含 <p>')
verify('p tag → true', () => looksLikeHtml('<p>para</p>'), true)

// 分支7: <a href=
console.log('\n[分支7] 输入含 <a href=')
verify('a with href → true', () => looksLikeHtml('<a href="/link">text</a>'), true)

// 分支8: 无匹配（纯文本）
console.log('\n[分支8] 纯文本，无 HTML 标签')
verify('plain text → false', () => looksLikeHtml('just plain text'), false)

// 分支9: 空字符串
console.log('\n[分支9] 空字符串')
verify('empty → false', () => looksLikeHtml(''), false)

console.log('\n\n========== slimdownHtml 分支覆盖 ==========')

// 分支1: 移除 <svg>
console.log('\n[分支1] 输入含 <svg>')
verify('remove svg', () => slimdownHtml('<svg xmlns="http://www.w3.org/2000/svg"></svg><div>text</div>'), '<div>text</div>')

// 分支2: 移除 <img>
console.log('\n[分支2] 输入含 <img>')
verify('remove img', () => slimdownHtml('<img src="photo.jpg" alt="photo"><p>content</p>'), '<p>content</p>')

// 分支3: 移除 data URI
console.log('\n[分支3] 输入含 href="data:..."')
verify('remove data URI', () => slimdownHtml('<a href="data:text/html,test">link</a>'), '<a>link</a>')

// 分支4: 只保留 href
console.log('\n[分支4] 输入含 href + 其他属性')
verify('keep href strip others', () => slimdownHtml('<a href="/link" class="btn" id="main">text</a>'), '<a href="/link">text</a>')

// 分支5: 保留 href
console.log('\n[分支5] 输入只有 href')
verify('keep href alone', () => slimdownHtml('<a href="https://example.com">example</a>'), '<a href="https://example.com">example</a>')

// 分支6: 空输入
console.log('\n[分支6] 空字符串')
verify('empty → empty', () => slimdownHtml(''), '')

console.log(`\n\n━━━ html.ts 闭环结果: ${pass} pass, ${fail} fail ━━━`)
if (fail > 0) { console.log('❌ 有失败，需要修改程序\n'); process.exit(1) }
console.log('✅ 全部通过\n')
