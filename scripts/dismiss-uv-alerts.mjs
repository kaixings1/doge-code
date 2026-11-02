#!/usr/bin/env node
/**
 * 批量 dismiss Dependabot 告警（用于已从仓库删除的 lockfile 造成的陈旧告警）
 *
 * 用途：.claude/skills/repo-trading/uv.lock 已从仓库删除，但 Dependabot
 * 仍挂着一批指向它的告警。本脚本把这些告警标记为 not_used。
 *
 * 用法：
 *   node scripts/dismiss-uv-alerts.mjs                    # 默认处理 uv.lock 相关
 *   node scripts/dismiss-uv-alerts.mjs <manifest-prefix>  # 指定 manifest 路径前缀
 *   node scripts/dismiss-uv-alerts.mjs --dry-run          # 只列出，不修改
 *
 * 依赖：gh CLI 已登录（gh auth token 可用）
 */
import { execFileSync } from 'node:child_process'

const REPO = 'kaixings1/doge-code'
const DEFAULT_PREFIX = '.claude/skills/repo-trading/'
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const prefix = args.find((a) => !a.startsWith('--')) ?? DEFAULT_PREFIX

function gh(apiArgs) {
  return execFileSync('gh', ['api', ...apiArgs], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
}

const raw = gh([
  `repos/${REPO}/dependabot/alerts?state=open&per_page=100`,
  '--paginate',
  '-q',
  `.[] | select(.dependency.manifest_path | startswith("${prefix}")) | .number`,
])
const numbers = raw.split('\n').map((s) => s.trim()).filter(Boolean)
console.log(`匹配 manifest 前缀 "${prefix}" 的 open 告警：${numbers.length} 条`)

if (dryRun) {
  console.log(numbers.join(', '))
  process.exit(0)
}

let ok = 0
let failed = 0
for (const n of numbers) {
  try {
    gh([
      '-X',
      'PATCH',
      `repos/${REPO}/dependabot/alerts/${n}`,
      '-f',
      'state=dismissed',
      '-f',
      'dismissed_reason=not_used',
      '-f',
      'dismissed_comment=lockfile removed from repository',
    ])
    ok++
  } catch (e) {
    failed++
    console.error(`#${n} 失败: ${String(e.stderr || e.message).split('\n')[0]}`)
  }
}
console.log(`完成：成功 ${ok} 条，失败 ${failed} 条`)
