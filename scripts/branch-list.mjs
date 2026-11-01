#!/usr/bin/env node
// branch-list.mjs — 列出仓库所有分支（本地 + 远程）及最近提交信息。
//
// 解决痛点：git for-each-ref / git branch -r 在 MSYS2 下 `%cd`/`%an` 会被当成
// Windows 变量吃掉，中文分支名会撑爆单行。本脚本用 node 直接调 git 并格式化输出，
// 统一用 for-each-ref 取字段，避开 MSYS2 变量替换陷阱。
//
// 用法：
//   node scripts/branch-list.mjs            # 全部本地+远程
//   node scripts/branch-list.mjs --remote   # 仅远程
//   node scripts/branch-list.mjs --local    # 仅本地

import { execFileSync } from 'node:child_process'

const mode = process.argv.includes('--remote') ? 'remote'
  : process.argv.includes('--local') ? 'local' : 'all'

// 用 execFileSync 直接传参数组，避开 cmd.exe / MSYS2 对 % 和引号的特殊解析
// （`%(committerdate:short)` 里的 % 在 cmd 下会被当变量吃掉，导致 ' 不是命令）。
function git(args) {
  return execFileSync('git', args, { encoding: 'utf-8' }).trim()
}

function listRefs(pattern) {
  return git(['for-each-ref', '--format=%(refname:short)', pattern])
    .split('\n').filter(Boolean)
}

let localRefs, remoteRefs
if (mode !== 'remote') localRefs = git(['branch']).split('\n').map(s => s.replace(/^[* ]+/, '')).filter(Boolean)
if (mode !== 'local') remoteRefs = listRefs('refs/remotes').map(r => r.replace(/^.*?\//, ''))

const printSet = (title, refs, prefix) => {
  console.log(`\n=== ${title}（${refs.length}）===`)
  for (const ref of refs) {
    // 跳过远程 HEAD 指针
    if (ref.endsWith('/HEAD')) continue
    // 还原完整 ref 路径，避免本地/远程歧义
    const full = prefix + ref
    let info = ''
    try {
      const raw = git(['for-each-ref',
        '--format=%(committerdate:short)|%(authorname)|%(subject)', full])
      info = raw.trim() || '| | (no history)'
    } catch { info = '| | (no history)' }
    console.log(`${ref}\n    ${info}`)
  }
}

if (localRefs) printSet('本地分支', localRefs, 'refs/heads/')
if (remoteRefs) printSet('远程分支', remoteRefs, 'refs/remotes/')
