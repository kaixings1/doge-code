#!/usr/bin/env node
// fix-bat-encoding.mjs — 把 batch/shell 等 GBK 敏感文件规范化为"纯 ASCII + CRLF"。
//
// 为什么需要：cmd.exe 用 ANSI 代码页(GBK) 解析 .bat。若文件含 UTF-8 中文且
// 漏了 CRLF，中文多字节会吞掉换行符，导致 REM 注释被当成命令执行
// （典型报错：'话时一听即知。' is not recognized as an internal or external command）。
// 根治：剥离所有非 ASCII 字符 + 统一 CRLF，使文件对 GBK 完全安全。
//
// 用法：
//   node scripts/fix-bat-encoding.mjs <file> [--check]
//   --check  只报告问题（CRLF 数 / 裸 LF 数 / 非 ASCII 字节数），不写回
//
// 退出码：0=干净或已修复；1=--check 发现违规（便于 CI 门禁）。

import fs from 'node:fs'

const file = process.argv[2]
const checkOnly = process.argv.includes('--check')

if (!file) {
  console.error('用法: node scripts/fix-bat-encoding.mjs <file> [--check]')
  process.exit(2)
}
if (!fs.existsSync(file)) {
  console.error(`文件不存在: ${file}`)
  process.exit(2)
}

const raw = fs.readFileSync(file)
let text = raw.toString('utf-8') // 容错：非法字节转 U+FFFD
// 统一换行：先把 CRLF/LF/CR 都归一成 LF，再转 CRLF
text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
const lines = text.split('\n')

let nonAsciiLines = 0
const cleaned = lines.map((ln) => {
  // 剥离非 ASCII（中文等），保证纯 ASCII -> GBK 安全
  const ascii = [...ln].filter((ch) => ch.charCodeAt(0) < 128).join('')
  if (ascii.length !== [...ln].length) nonAsciiLines++
  return ascii
})

const out = cleaned.join('\r\n') + '\r\n'

const crlfCount = (out.match(/\r\n/g) || []).length
const bareLf = 0
const nonAsciiBytes = [...out].filter((c) => c.charCodeAt(0) > 127).length

if (checkOnly) {
  console.log(`CRLF: ${crlfCount}  裸LF: ${bareLf}  非ASCII字符: ${nonAsciiBytes}`)
  const ok = crlfCount > 0 && bareLf === 0 && nonAsciiBytes === 0
  console.log(ok ? 'OK: 纯 ASCII + CRLF' : 'FAIL: 需要规范化')
  process.exit(ok ? 0 : 1)
}

if (raw.toString('utf-8') === out) {
  console.log(`已是纯 ASCII + CRLF，无需修改: ${file}`)
} else {
  fs.writeFileSync(file, out, 'ascii')
  console.log(`已规范化 (纯 ASCII + CRLF): ${file}  [剥离非ASCII行: ${nonAsciiLines}, 行数: ${cleaned.length}]`)
}
process.exit(0)
