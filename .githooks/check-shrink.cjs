#!/usr/bin/env node
/**
 * 核心文件「大幅删减」守卫。
 *
 * 被 .githooks/pre-commit 调用。检查暂存区（索引）中每个受保护文件，
 * 若相对 HEAD 的删减同时满足「删除行数 >= 阈值」与「删减比例 >= 阈值」，
 * 则判定为疑似误删并以非零码退出（拦截提交）。
 *
 * 用法：node check-shrink.cjs <shrinkLines> <shrinkRatio> "<glob1> <glob2> ..."
 * 退出码：0 = 通过；1 = 检出疑似误删
 */

const { execFileSync } = require('child_process')

const [, , argLines, argRatio, argProtected] = process.argv
const SHRINK_LINES = parseInt(argLines, 10) || 50
const SHRINK_RATIO = parseFloat(argRatio) || 50
const PATTERNS = (argProtected || 'README.md CLAUDE.md')
  .split(/\s+/)
  .filter(Boolean)

function git(args, opts = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
      ...opts,
    })
  } catch {
    return null
  }
}

/** 简易 glob 转正则（仅支持 * 与 ?，足够本用途）。 */
function globToRegExp(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const re = esc.replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp('^' + re + '$')
}

const matchers = PATTERNS.map(globToRegExp)
function isProtected(path) {
  return matchers.some(re => re.test(path))
}

/** 统计一段文本的行数（与 `wc -l` 口径对齐：按换行符计）。 */
function countLines(text) {
  if (!text) return 0
  const n = text.split('\n').length
  // 末尾无换行时 split 会多出 1 个空元素，减去；与 wc -l 一致。
  return text.endsWith('\n') ? n - 1 : n
}

// 暂存区中所有新增/修改/重命名/删除的文件名（含状态码）。
// --diff-filter=ACMR 排除纯删除的 D（文件被整删是显式操作，
// 但整删同样危险，故纳入，用 D 单独处理）。
const nameStatus = git([
  'diff',
  '--cached',
  '--name-status',
  '--diff-filter=ACMRD',
  '-z',
])
if (nameStatus === null) {
  process.exit(0) // 无法读取 diff（首次提交等），放行
}

// -z 输出以 NUL 分隔，状态与路径是**各自独立的项**：
//   M\0README.md\0A\0new.md\0R100\0old\0new\0
// 因此按「状态项 + 路径项」成对消费；R/C 带相似度分数，需多吃一个路径。
const parts = nameStatus.split('\0').filter(Boolean)
const entries = []
for (let i = 0; i < parts.length; ) {
  const statusRaw = parts[i]
  const status = statusRaw[0] // 取首字母，如 R100 -> R
  if (status === 'R' || status === 'C') {
    // 重命名/复制：<status>\0<src>\0<dst>\0 —— 取 dst（新路径）
    const dst = parts[i + 2]
    if (dst) entries.push({ status, path: dst })
    i += 3
  } else {
    const p = parts[i + 1]
    if (p) entries.push({ status, path: p })
    i += 2
  }
}

const problems = []

for (const { status, path } of entries) {
  if (!isProtected(path)) continue

  const oldText = git(['show', `HEAD:${path}`])
  const newText = git(['show', `:${path}`])

  const oldLines = countLines(oldText || '')
  const newLines = newText === null ? 0 : countLines(newText)

  // 只关心「从较大体量骤减」，小幅或初始就小的文件不报。
  if (oldLines < 100) continue

  const removed = oldLines - newLines
  const ratio = oldLines === 0 ? 0 : (removed / oldLines) * 100

  if (removed >= SHRINK_LINES && ratio >= SHRINK_RATIO) {
    problems.push({
      path,
      status,
      oldLines,
      newLines,
      removed,
      ratio: ratio.toFixed(1),
    })
  }
}

if (problems.length === 0) {
  process.exit(0)
}

console.error('')
console.error('  [pre-commit] 拦截：核心文件被大幅删减（疑似误删）')
console.error('')
for (const p of problems) {
  console.error(
    `    ${p.path}: ${p.oldLines} 行 -> ${p.newLines} 行 ` +
      `(删除 ${p.removed} 行, ${p.ratio}%) [${p.status}]`,
  )
}
console.error('')
console.error('  历史教训：README.md 曾被批量清理操作两次误删（613->4 行）。')
console.error('')
console.error('  若确为有意删减，请用以下任一方式豁免后重试：')
console.error('    DOGE_ALLOW_SHRINK=1 git commit ...')
console.error('    git commit --no-verify')
console.error('')
console.error('  阈值可通过环境变量调整：')
console.error('    DOGE_SHRINK_LINES=<行数>  DOGE_SHRINK_RATIO=<百分比>')
console.error('')

process.exit(1)
