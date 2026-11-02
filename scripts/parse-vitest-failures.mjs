// 从 vitest 输出日志中提取失败的测试文件列表
// 用法：node scripts/parse-vitest-failures.mjs <logfile>
import { readFileSync } from 'node:fs'

const file = process.argv[2]
if (!file) {
  console.error('用法: node scripts/parse-vitest-failures.mjs <logfile>')
  process.exit(1)
}
const text = readFileSync(file, 'utf8').replace(/\x1b\[[0-9;]*m/g, '')
const files = new Set()
for (const line of text.split('\n')) {
  const m = line.match(/^\s*(?:×|FAIL)\s+(\S+\.test\.ts)/)
  if (m) files.add(m[1])
}
const list = [...files].sort()
console.log(`失败文件数: ${list.length}`)
console.log(list.join('\n'))
