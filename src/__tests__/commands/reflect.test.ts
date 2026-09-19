import { describe, it, expect, vi, beforeEach } from 'vitest'
import { call } from '../../commands/reflect/reflect.ts'
import type { LocalCommandCall } from '../../types/command.js'
import { expectText } from "../utils/commandResult.js";

// Mock dependencies
vi.mock('../../bootstrap/state.js', () => ({
  getOriginalCwd: () => '/mock/project',
}))

vi.mock('fs', () => ({
  readdirSync: vi.fn(() => ['src', 'node_modules', 'package.json', '.git']),
  statSync: vi.fn(() => ({ isDirectory: () => true, isFile: () => true })),
}))

vi.mock('../../utils/git.js', () => ({
  getIsGit: vi.fn(async () => true),
  getBranch: vi.fn(async () => 'main'),
  getHead: vi.fn(async () => 'abc123def456'),
  getIsClean: vi.fn(async () => true),
  getChangedFiles: vi.fn(async () => []),
}))

vi.mock('child_process', () => ({
  execSync: vi.fn(() => 'abc123def Initial commit\n'),
}))

describe('reflect command', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return reflection report with model info', async () => {
    const mockContext = {
      getAppState: () => ({
        mainLoopModel: 'claude-sonnet-4-6',
        advisorModel: null,
        planMode: false,
      }),
      setAppState: vi.fn(),
    } as any

    const result = await call('', mockContext)

    expect(expectText(result)).toContain('claude-sonnet-4-6')
    expect(expectText(result)).toContain('反思报告')
    expect(expectText(result)).toContain('仓库状态')
    expect(expectText(result)).toContain('可用命令')
  })

  it('should detect Node.js project and suggest relevant commands', async () => {
    const mockContext = {
      getAppState: () => ({
        mainLoopModel: 'claude-sonnet-4-6',
        advisorModel: null,
        planMode: false,
      }),
      setAppState: vi.fn(),
    } as any

    const result = await call('', mockContext)

    expect(expectText(result)).toContain('Node.js')
    expect(expectText(result)).toContain('/bughunter')
    expect(expectText(result)).toContain('/refactor')
  })

  it('should include helpful commands in suggestions', async () => {
    const mockContext = {
      getAppState: () => ({
        mainLoopModel: null,
        advisorModel: null,
        planMode: false,
      }),
      setAppState: vi.fn(),
    } as any

    const result = await call('', mockContext)

    expect(expectText(result)).toContain('/cost')
    expect(expectText(result)).toContain('/memory')
    expect(expectText(result)).toContain('/advisor')
    expect(expectText(result)).toContain('/collab')
  })

  it('should show git branch and status when in git repo', async () => {
    const mockContext = {
      getAppState: () => ({
        mainLoopModel: 'claude-sonnet-4-6',
        advisorModel: null,
        planMode: false,
      }),
      setAppState: vi.fn(),
    } as any

    const result = await call('', mockContext)

    expect(expectText(result)).toContain('main')
    expect(expectText(result)).toContain('abc123d')
    expect(expectText(result)).toContain('干净')
  })

  it('should handle non-git directory gracefully', async () => {
    const { getIsGit } = await import('../../utils/git.js')
    ;(getIsGit as any).mockResolvedValueOnce(false)

    const mockContext = {
      getAppState: () => ({
        mainLoopModel: 'claude-sonnet-4-6',
        advisorModel: null,
        planMode: false,
      }),
      setAppState: vi.fn(),
    } as any

    const result = await call('', mockContext)

    expect(expectText(result)).toContain('不是 Git 仓库')
  })
})
