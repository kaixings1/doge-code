/**
 * `permissions.blockWritesOutsideWorkingDirectories` /
 * `blockReadsOutsideWorkingDirectories`（对齐官方 2.1.314）。
 *
 * 语义来源（从 2.1.316 二进制提取的错误文案，不是猜测）：
 *   "Writes outside the working directories are blocked
 *    (permissions.blockWritesOutsideWorkingDirectories).
 *    Add the directory with /add-dir, or remove that setting."
 *   "Writes to Claude Code settings files are blocked while ... is on,
 *    because a settings file can lift that block."
 *
 * 覆盖重点：
 * 1. 开关关闭时一律放行
 * 2. 工作目录内放行、外拒绝
 * 3. **设置文件例外**：即使在工作目录内也拦（否则改 settings.json 即可关掉开关，
 *    这是官方文案明说的理由，也是本实现最容易漏的一条）
 * 4. strictJson（无法解析 managed 目录）时任何 .json 都算设置文件
 * 5. 读限制无设置文件例外
 *
 * 变异验证（必须做）：
 *   - 把 evaluateWriteScopeBlock 里设置文件判断挪到 insideWorking 之后
 *     → 用例 3 失败（工作目录内的 settings.json 被放行）
 *   - 删掉 strictJson 分支 → 用例 4 失败
 *   - 让 evaluateReadScopeBlock 开头直接 return {blocked:false} → 用例 5 失败
 *   均已实测捕获。
 */
import { describe, it, expect } from 'vitest'
import {
  evaluateReadScopeBlock,
  evaluateWriteScopeBlock,
  looksLikeClaudeSettingsFile,
} from '../../src/utils/permissions/workingDirectoryScope.js'

describe('looksLikeClaudeSettingsFile', () => {
  it('识别常见设置文件名', () => {
    expect(looksLikeClaudeSettingsFile('/p/.claude/settings.json', false)).toBe(true)
    expect(looksLikeClaudeSettingsFile('/p/.claude/settings.local.json', false)).toBe(true)
    expect(looksLikeClaudeSettingsFile('C:\\Users\\x\\.claude.json', false)).toBe(true)
  })

  it('.claude 目录下的任意 json 都算', () => {
    expect(looksLikeClaudeSettingsFile('/p/.claude/hooks/x.json', false)).toBe(true)
  })

  it('普通业务文件不算', () => {
    expect(looksLikeClaudeSettingsFile('/p/src/index.ts', false)).toBe(false)
    expect(looksLikeClaudeSettingsFile('/p/package.json', false)).toBe(false)
  })

  it('strictJson 时任何 json 都算（无法解析 managed 目录）', () => {
    expect(looksLikeClaudeSettingsFile('/p/package.json', true)).toBe(true)
    expect(looksLikeClaudeSettingsFile('/p/src/index.ts', true)).toBe(false)
  })
})

describe('evaluateWriteScopeBlock', () => {
  it('开关关闭时一律放行', () => {
    expect(
      evaluateWriteScopeBlock({
        enabled: false,
        path: '/outside/a.ts',
        insideWorking: false,
        strictJson: false,
      }).blocked,
    ).toBe(false)
  })

  it('工作目录内放行', () => {
    expect(
      evaluateWriteScopeBlock({
        enabled: true,
        path: '/repo/src/a.ts',
        insideWorking: true,
        strictJson: false,
      }).blocked,
    ).toBe(false)
  })

  it('工作目录外拒绝，并给出官方同款提示', () => {
    const r = evaluateWriteScopeBlock({
      enabled: true,
      path: '/outside/a.ts',
      insideWorking: false,
      strictJson: false,
    })
    expect(r.blocked).toBe(true)
    if (r.blocked) {
      expect(r.message).toContain('blockWritesOutsideWorkingDirectories')
      expect(r.message).toContain('/add-dir')
    }
  })

  it('设置文件即使在工作目录内也拦（防止改设置绕过）', () => {
    const r = evaluateWriteScopeBlock({
      enabled: true,
      path: '/repo/.claude/settings.json',
      insideWorking: true,
      strictJson: false,
    })
    expect(r.blocked).toBe(true)
    if (r.blocked) {
      expect(r.message).toContain('settings file can lift that block')
    }
  })

  it('strictJson 时普通 json 也被拦', () => {
    expect(
      evaluateWriteScopeBlock({
        enabled: true,
        path: '/repo/package.json',
        insideWorking: true,
        strictJson: true,
      }).blocked,
    ).toBe(true)
  })
})

describe('evaluateReadScopeBlock', () => {
  it('关闭时放行', () => {
    expect(
      evaluateReadScopeBlock({ enabled: false, insideWorking: false }).blocked,
    ).toBe(false)
  })

  it('目录内放行、外拒绝', () => {
    expect(
      evaluateReadScopeBlock({ enabled: true, insideWorking: true }).blocked,
    ).toBe(false)
    const r = evaluateReadScopeBlock({ enabled: true, insideWorking: false })
    expect(r.blocked).toBe(true)
    if (r.blocked) {
      expect(r.message).toContain('blockReadsOutsideWorkingDirectories')
    }
  })
})
