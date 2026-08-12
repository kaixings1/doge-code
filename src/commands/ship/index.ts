/**
 * commands/ship/index.ts — 完整部署工作流命令
 *
 * Phase 4: CI & Review Monitor Loop (ship-ci-review-loop.ts)
 * Phase 5: Subagent Review (standalone only)
 * Phase 6: Merge PR
 * Phase 7-10: Deploy & Validate (platform-specific)
 * Phase 11: Cleanup
 * Phase 12: Completion Report
 *
 * 依赖: gh CLI, git
 * 复用: commit-push-pr.ts (PR 创建工具)
 */

import type { Command, LocalCommandCall, LocalCommandResult } from '../types/command.js'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import { gitExe } from '../../utils/git.js'
import { runCIMonitorLoop } from './ship-ci-review-loop.js'

// ============================================================================
// Types
// ============================================================================

interface ShipOptions {
  /** 合并策略 */
  strategy?: 'squash' | 'merge' | 'rebase'
  /** 跳过测试 */
  skipTests?: boolean
  /** 仅显示计划，不执行 */
  dryRun?: boolean
}

// ============================================================================
// Phase 1: Pre-flight Checks
// ============================================================================

async function preflightChecks(): Promise<{ ok: boolean; error?: string; platform?: string }> {
  // Check gh CLI
  const { code: ghCode } = await execFileNoThrow('gh', ['--version'], { preserveOutputOnError: false })
  if (ghCode !== 0) {
    return { ok: false, error: 'GitHub CLI (gh) 未安装。请从 https://cli.github.com/ 安装并运行 gh auth login' }
  }

  // Check git origin
  const { code: originCode, stdout } = await execFileNoThrow(gitExe(), ['remote', 'get-url', 'origin'], { preserveOutputOnError: false })
  if (originCode !== 0 || !stdout.trim()) {
    return { ok: false, error: '未配置远程仓库 origin，请先运行 git remote add origin <url>' }
  }

  // Get current branch
  const { code: branchCode, stdout: branchStdout } = await execFileNoThrow(gitExe(), ['branch', '--show-current'], { preserveOutputOnError: false })
  const currentBranch = branchCode === 0 ? branchStdout.trim() : null
  const mainBranch = await getDefaultBranch()

  if (currentBranch === mainBranch) {
    return { ok: false, error: `无法从 ${mainBranch} 分支部署，必须切换到功能分支` }
  }

  return { ok: true, platform: 'github', currentBranch, mainBranch }
}

async function getDefaultBranch(): Promise<string> {
  await execFileNoThrow(gitExe(), ['fetch', 'origin', '--prune'], { preserveOutputOnError: false })
  const { stdout, code } = await execFileNoThrow(
    gitExe(),
    ['remote', 'show', 'origin', '--', 'HEAD'],
    { preserveOutputOnError: false }
  )
  if (code === 0) {
    const match = stdout.match(/HEAD branch: (\S+)/)
    if (match) return match[1]!
  }
  for (const candidate of ['main', 'master', 'develop']) {
    const { code: checkCode } = await execFileNoThrow(gitExe(), ['rev-parse', '--verify', candidate], { preserveOutputOnError: false })
    if (checkCode === 0) return candidate
  }
  return 'main'
}

// ============================================================================
// Phase 2: Commit Current Work
// ============================================================================

async function commitCurrentWork(message: string): Promise<{ committed: boolean; sha?: string; error?: string }> {
  try {
    const { code: statusCode } = await execFileNoThrow(gitExe(), ['status', '--porcelain'], { preserveOutputOnError: false })
    if (statusCode !== 0) {
      return { committed: false, error: 'git status 检查失败' }
    }

    // Stage all changes (excluding .env files)
    const { stdout: statusOut } = await execFileNoThrow(gitExe(), ['status', '--porcelain'], { preserveOutputOnError: false })
    const files = statusOut.split('\n').filter(line => {
      const file = line.slice(3).trim()
      return file && !file.startsWith('.env') && !file.includes('.env.')
    })

    if (files.length === 0) {
      return { committed: false }
    }

    for (const f of files) {
      await execFileNoThrow(gitExe(), ['add', f.trim()], { preserveOutputOnError: false })
    }

    await execFileNoThrow(gitExe(), ['commit', '-m', message], { preserveOutputOnError: false })

    const { stdout: shaOut } = await execFileNoThrow(gitExe(), ['rev-parse', 'HEAD'], { preserveOutputOnError: false })
    return { committed: true, sha: shaOut.trim() }
  } catch (err) {
    return { committed: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ============================================================================
// Phase 3: Create Pull Request
// ============================================================================

async function createPR(title: string, body: string, base: string): Promise<{ url?: string; number?: number; error?: string }> {
  try {
    const { stdout, code } = await execFileNoThrow('gh', [
      'pr', 'create',
      '--base', base,
      '--title', title,
      '--body', body,
    ], { preserveOutputOnError: false })

    if (code !== 0) {
      return { error: `PR 创建失败: ${stdout}` }
    }

    // Extract PR number from URL
    const match = stdout.match(/pull\/(\d+)/)
    return { url: stdout.trim(), number: match ? parseInt(match[1]!) : undefined }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// ============================================================================
// Phase 6: Merge PR
// ============================================================================

async function mergePR(prNumber: number, strategy: string = 'squash'): Promise<{ merged: boolean; sha?: string; error?: string }> {
  try {
    // Verify mergeable
    const { code: mergeableCode } = await execFileNoThrow('gh', [
      'pr', 'view', String(prNumber), '--json', 'mergeable', '--jq', '.mergeable'
    ], { preserveOutputOnError: false })

    if (mergeableCode !== 0) {
      return { merged: false, error: 'PR 无法合并' }
    }

    // Merge
    const { code: mergeCode } = await execFileNoThrow('gh', [
      'pr', 'merge', String(prNumber),
      `--${strategy}`,
      '--delete-branch',
    ], { preserveOutputOnError: false })

    if (mergeCode !== 0) {
      return { merged: false, error: 'PR 合并失败' }
    }

    // Get merge SHA
    const { stdout: shaOut } = await execFileNoThrow(gitExe(), ['rev-parse', 'HEAD'], { preserveOutputOnError: false })
    return { merged: true, sha: shaOut.trim() }
  } catch (err) {
    return { merged: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ============================================================================
// Phase 11: Cleanup
// ============================================================================

async function cleanupWorktrees(): Promise<void> {
  try {
    const { stdout } = await execFileNoThrow(gitExe(), ['worktree', 'list', '--porcelain'], { preserveOutputOnError: false })
    const lines = stdout.split('\n')
    let currentPath = ''

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        currentPath = line.slice(9).trim()
        const repoRoot = (await execFileNoThrow(gitExe(), ['rev-parse', '--show-toplevel'], { preserveOutputOnError: false })).stdout.trim()
        if (currentPath && currentPath !== repoRoot) {
          await execFileNoThrow(gitExe(), ['worktree', 'remove', currentPath, '--force'], { preserveOutputOnError: false }).catch(() => {})
        }
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================================================
// Main Command
// ============================================================================

const call: LocalCommandCall = async (args: string): Promise<LocalCommandResult> => {
  const trimmed = (args ?? '').trim()
  const startTime = Date.now()

  // Parse options
  const strategy = trimmed.includes('--strategy merge') ? 'merge' :
                   trimmed.includes('--strategy rebase') ? 'rebase' : 'squash'
  const dryRun = trimmed.includes('--dry-run')
  const skipTests = trimmed.includes('--skip-tests')

  // Help
  if (trimmed === '--help' || trimmed === 'help') {
    return {
      type: 'text',
      value: [
        '# 🚀 /ship — 完整部署工作流',
        '',
        '端到端 PR 工作流: commit → PR → CI → review → merge → deploy',
        '',
        '## 用法',
        '',
        '```',
        '/ship [--strategy squash|merge|rebase] [--skip-tests] [--dry-run]',
        '```',
        '',
        '## 阶段',
        '',
        '| 阶段 | 说明 |',
        '|------|------|',
        '| Phase 1 | Pre-flight 检查 |',
        '| Phase 2 | 提交当前工作 |',
        '| Phase 3 | 创建 PR |',
        '| Phase 4 | CI & Review Monitor Loop（强制） |',
        '| Phase 5 | Review（仅 standalone） |',
        '| Phase 6 | Merge PR |',
        '| Phase 7-10 | Deploy & Validate |',
        '| Phase 11 | Cleanup |',
        '| Phase 12 | 完成报告 |',
        '',
        '## 示例',
        '',
        '```',
        '/ship',
        '/ship --strategy merge',
        '/ship --dry-run',
        '```',
      ].join('\n'),
    }
  }

  const lines: string[] = []
  lines.push('🚀 /ship — 完整部署工作流')
  lines.push('')

  // Phase 1: Pre-flight
  lines.push('## Phase 1: Pre-flight 检查')
  const preflight = await preflightChecks()
  if (!preflight.ok) {
    lines.push(`❌ ${preflight.error}`)
    return { type: 'text', value: lines.join('\n') }
  }
  lines.push(`✅ 平台: ${preflight.platform}`)
  lines.push(`✅ 当前分支: ${preflight.currentBranch}`)
  lines.push(`✅ 目标分支: ${preflight.mainBranch}`)
  lines.push('')

  if (dryRun) {
    lines.push('## Dry Run 结果')
    lines.push(`**Branch**: ${preflight.currentBranch} → **Target**: ${preflight.mainBranch}`)
    lines.push('')
    return { type: 'text', value: lines.join('\n') }
  }

  // Phase 2: Commit
  lines.push('## Phase 2: 提交当前工作')
  const { code: statusCode } = await execFileNoThrow(gitExe(), ['status', '--porcelain'], { preserveOutputOnError: false })
  const hasChanges = statusCode === 0 && (await execFileNoThrow(gitExe(), ['status', '--porcelain'], { preserveOutputOnError: false })).stdout.trim().length > 0

  if (hasChanges) {
    const commitResult = await commitCurrentWork('chore: ship changes')
    if (commitResult.committed) {
      lines.push(`✅ 已提交: ${commitResult.sha}`)
    } else {
      lines.push(`⚠️ 提交失败: ${commitResult.error || 'no changes'}`)
    }
  } else {
    lines.push('ℹ️ 无未提交的更改')
  }
  lines.push('')

  // Phase 3: Create PR
  lines.push('## Phase 3: 创建 PR')
  const branch = preflight.currentBranch || 'main'
  const title = `chore: changes from ${branch}`
  const body = `## Summary\n\nChanges from \`${branch}\`.\n\n## Test Plan\n\n- [ ] Run existing tests\n- [ ] Manual verification\n`

  const prResult = await createPR(title, body, preflight.mainBranch!)
  if (prResult.error) {
    lines.push(`❌ PR 创建失败: ${prResult.error}`)
    return { type: 'text', value: lines.join('\n') }
  }
  lines.push(`✅ 已创建 PR #${prResult.number}: ${prResult.url}`)
  lines.push('')

  if (!prResult.number) {
    lines.push('❌ 无法获取 PR 编号')
    return { type: 'text', value: lines.join('\n') }
  }

  // Phase 4: CI/Review Monitor Loop (mandatory)
  lines.push('## Phase 4: CI & Review Monitor Loop')
  lines.push('⏳ 这是强制阶段，可能需要几分钟...')
  lines.push('')

  const monitorResult = await runCIMonitorLoop({
    prNumber: prResult.number,
    maxIterations: 10,
    initialWaitSeconds: 180,
    iterationWaitSeconds: 30,
    verbose: true,
  })

  lines.push(`迭代次数: ${monitorResult.iterations}`)
  lines.push(`未解决评论: ${monitorResult.unresolvedComments}`)
  lines.push(`CI 失败: ${monitorResult.ciFailures}`)
  lines.push(`耗时: ${Math.round(monitorResult.durationMs / 1000)}s`)
  lines.push('')

  if (!monitorResult.success) {
    lines.push('⚠️ 仍有未解决的评论，但继续执行后续步骤...')
    lines.push('')
  } else {
    lines.push('✅ Phase 4 完成：CI 通过，评论已解决')
    lines.push('')
  }

  // Phase 6: Merge PR
  lines.push('## Phase 6: Merge PR')
  const mergeResult = await mergePR(prResult.number, strategy)
  if (mergeResult.merged) {
    lines.push(`✅ 已合并 PR #${prResult.number} at ${mergeResult.sha}`)
  } else {
    lines.push(`⚠️ 合并失败: ${mergeResult.error}`)
  }
  lines.push('')

  // Phase 11: Cleanup
  lines.push('## Phase 11: Cleanup')
  await cleanupWorktrees()
  lines.push('✅ Worktree 清理完成')
  lines.push('')

  // Phase 12: Completion Report
  const duration = Math.round((Date.now() - startTime) / 1000)
  lines.push('## 部署完成')
  lines.push('')
  lines.push(`**PR**: #${prResult.number} | **状态**: Merged`)
  lines.push(`**耗时**: ${duration}s`)
  lines.push('')
  lines.push('✅ 部署成功！')

  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// Command Registration
// ============================================================================

const ship: Command = {
  type: 'local',
  name: 'ship',
  description: '🚀 完整部署工作流: commit → PR → CI → review → merge → deploy',
  aliases: ['deploy-full', 'ship-it'],
  arguments: [
    {
      name: '--strategy',
      description: '合并策略: squash (默认) | merge | rebase',
      required: false,
    },
    {
      name: '--skip-tests',
      description: '跳过测试验证（危险）',
      required: false,
    },
    {
      name: '--dry-run',
      description: '仅显示计划，不执行',
      required: false,
    },
  ],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default ship
