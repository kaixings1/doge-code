#!/usr/bin/env node
// branch-diff.mjs — 比对某分支相对 main 的源码差异，区分"纯新增文件"与
// "同名但内容不同(会覆盖)"。自动排除 vendor/ 与 node_modules/ 二进制噪声。
//
// 背景：fork 分支常与 main 是 unrelated histories，两点 `git diff --stat` 会把整套
// 基准差异算进来（显示几千文件改动），失真。本脚本用 ls-tree 取文件集合做集合
// 差/交，再对交集做 blob hash 比较，给出真实可搬运文件清单。
//
// 用法：
//   node scripts/branch-diff.mjs <branch> [--src-only] [--limit N]
//     <branch>      要分析的分支（如 doge-code/feature/editor-enhancement）
//     --src-only    只统计 src/ 下的 .ts/.tsx（默认也列其他目录纯新增）
//     --limit N     同名不同实现文件最多打印 N 个（默认 60）

import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const branch = args[0]
const srcOnly = args.includes('--src-only')
const limitArg = args.find(a => a.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 60

if (!branch) {
  console.error('用法: node scripts/branch-diff.mjs <branch> [--src-only] [--limit=N]')
  process.exit(2)
}

const mainRef = 'main'

// 用参数组调用，避开 MSYS2/cmd 对 % 和引号的特殊解析
function git(cmdArgs) {
  return execFileSync('git', cmdArgs, { encoding: 'utf-8', maxBuffer: 1 << 28 })
}

function treeFiles(ref) {
  return git(['ls-tree', '-r', '--name-only', ref])
    .split('\n').filter(Boolean)
    .filter(f => !f.startsWith('vendor/') && !f.startsWith('node_modules/'))
}

function isTarget(f) {
  if (srcOnly) return f.startsWith('src/') && (f.endsWith('.ts') || f.endsWith('.tsx'))
  return true
}

const treeBranch = new Set(treeFiles(branch).filter(isTarget))
const treeMain = new Set(treeFiles(mainRef).filter(isTarget))

const only = [...treeBranch].filter(f => !treeMain.has(f)).sort()
const common = [...treeBranch].filter(f => treeMain.has(f)).sort()

// 对同名文件比较 blob hash，找真正不同的
let diffCount = 0
const diffSample = []
for (const f of common) {
  const h1 = git(['rev-parse', `${branch}:${f}`]).trim()
  const h2 = git(['rev-parse', `${mainRef}:${f}`]).trim()
  if (h1 !== h2) {
    diffCount++
    if (diffSample.length < limit) diffSample.push(f)
  }
}

console.log(`\n=== ${branch} 相对 ${mainRef} ===`)
console.log(`纯新增文件（main 没有）: ${only.length}`)
for (const f of only) console.log('  +', f)
console.log(`\n同名但内容不同（会覆盖 main）: ${diffCount}`)
for (const f of diffSample) console.log('  ~', f)
if (diffCount > diffSample.length) console.log(`  ...（仅显示前 ${diffSample.length}，共 ${diffCount}）`)
