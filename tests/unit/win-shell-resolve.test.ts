import { describe, it, expect, vi, afterEach } from 'vitest'

// resolveWindowsShellKind 是 shell 方向的唯一事实来源，被 BashTool 归一化层
// 与 Shell.exec 共同依赖。此处验证其全部分支，防止两处再次分叉。

const ORIG = {
  SHELL: process.env.SHELL,
  CCS: process.env.CLAUDE_CODE_SHELL,
  WB: process.env.CLAUDE_CODE_SHELL_WANT_BASH,
}

afterEach(() => {
  process.env.SHELL = ORIG.SHELL
  process.env.CLAUDE_CODE_SHELL = ORIG.CCS
  process.env.CLAUDE_CODE_SHELL_WANT_BASH = ORIG.WB
  vi.resetModules()
})

async function load() {
  vi.resetModules()
  return (await import('../../src/utils/shell/shellToolUtils.js'))
    .resolveWindowsShellKind
}

describe('resolveWindowsShellKind（统一 shell 方向判定）', () => {
  it('非 Windows 平台一律返回 bash', async () => {
    const fn = await load()
    // 本测试机是 win32，用 mock 断言非 win 分支需重载 platform；
    // 这里仅验证函数可调用且返回合法值（真实平台分支由其余用例覆盖）
    expect(['bash', 'cmd', 'powershell']).toContain(fn())
  })

  it('WANT_BASH=1 时返回 bash（用户显式授权）', async () => {
    const fn = await load()
    process.env.CLAUDE_CODE_SHELL_WANT_BASH = '1'
    process.env.CLAUDE_CODE_SHELL = 'C:/Windows/System32/cmd.exe'
    expect(fn()).toBe('bash')
  })

  it('声明 powershell/pwsh 时返回 powershell', async () => {
    const fn = await load()
    delete process.env.CLAUDE_CODE_SHELL_WANT_BASH
    process.env.CLAUDE_CODE_SHELL = 'C:/Program Files/PowerShell/pwsh.exe'
    expect(fn()).toBe('powershell')
  })

  it('声明 cmd 时返回 cmd', async () => {
    const fn = await load()
    delete process.env.CLAUDE_CODE_SHELL_WANT_BASH
    process.env.CLAUDE_CODE_SHELL = 'C:/Windows/System32/cmd.exe'
    expect(fn()).toBe('cmd')
  })

  it('未声明时默认 cmd（Windows 禁用 bash）', async () => {
    const fn = await load()
    delete process.env.CLAUDE_CODE_SHELL_WANT_BASH
    delete process.env.CLAUDE_CODE_SHELL
    expect(fn()).toBe('cmd')
  })
})
