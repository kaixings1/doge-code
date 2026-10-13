// 扫描页面中硬编码的中文字符串，并统计 t() 覆盖情况
// 用法: node scripts/_audit-i18n.mjs [repoRoot] [--top N]
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.argv[2] || 'D:/kx2api'
const PAGES = path.join(ROOT, 'src/renderer/src/pages')
const CJK = /[\u4e00-\u9fff]/

function walk(d, o = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) { if (e.name !== '__tests__') walk(p, o) }
    else if (/\.tsx?$/.test(e.name)) o.push(p)
  }
  return o
}

const rows = []
for (const f of walk(PAGES)) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/)
  const hits = []
  let tCalls = 0
  lines.forEach((l, i) => {
    if (/\bt\(|\bi18n\.t\(/.test(l)) tCalls += (l.match(/\bt\(|\bi18n\.t\(/g) || []).length
    if (!CJK.test(l)) return
    const code = l.replace(/\/\/.*$/, '')
    if (/^\s*(\*|\/\*)/.test(code)) return
    const strs = [...code.matchAll(/['"`]([^'"`]*[\u4e00-\u9fff][^'"`]*)['"`]/g)].map(m => m[1])
    if (strs.length) hits.push({ line: i + 1, strs })
  })
  if (hits.length) rows.push({ file: path.relative(ROOT, f).replace(/\\/g, '/'), hits, tCalls, total: lines.length })
}

rows.sort((a, b) => b.hits.length - a.hits.length)
const topN = Number((process.argv.find(a => a.startsWith('--top')) || '--top20').split('=')[1] || 20)
for (const r of rows.slice(0, topN)) {
  console.log(`\n### ${r.file}  硬编码 ${r.hits.length} 处 / t() ${r.tCalls} 次 / 共 ${r.total} 行`)
  r.hits.slice(0, 12).forEach(h => console.log(`  :${h.line}  ${h.strs.join(' | ').slice(0, 100)}`))
  if (r.hits.length > 12) console.log(`  ... 另有 ${r.hits.length - 12} 处`)
}
console.log(`\n涉及文件 ${rows.length} 个，硬编码中文总计 ${rows.reduce((s, r) => s + r.hits.length, 0)} 处`)
