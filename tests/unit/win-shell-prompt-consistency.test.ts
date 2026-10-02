import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { resolveWindowsShellKind } from '../../src/utils/shell/shellToolUtils.js'

// 护栏：提示词层必须与执行层（resolveWindowsShellKind）方向一致。
//
// 历史 bug：未声明 CLAUDE_CODE_SHELL 时，执行层用 cmd.exe，但提示词层按旧逻辑
// 声称"运行于 MSYS2/Git Bash"，指示模型生成 ls/grep/pwd，实际由 cmd 执行 →
// 'ls' is not recognized / 'pwd' is not recognized。
//
// 注意：BashTool/prompt.ts 与 constants/prompts.ts 的 import 链极重
// （会连带加载 BashTool.tsx 的 zod schema，单测中触发循环依赖而失败），
// 故提示词层用源码级断言，不对其做运行时 import。

const ROOT = resolve(__dirname, '../..')
const read = (f: string) => readFileSync(resolve(ROOT, f), 'utf8')

// 执行层判定在 win32 下默认 cmd（未声明环境变量）
const CASES: Array<{ name: string; ccs?: string; wb?: string; expect: string }> = [
  { name: '未声明 → cmd（默认禁用 bash）', ccs: undefined, wb: undefined, expect: 'cmd' },
  { name: '声明 cmd → cmd', ccs: 'C:/Windows/System32/cmd.exe', wb: undefined, expect: 'cmd' },
  { name: '声明 pwsh → powershell', ccs: 'C:/pwsh.exe', wb: undefined, expect: 'powershell' },
  { name: 'WANT_BASH=1 → bash', ccs: 'C:/Windows/System32/cmd.exe', wb: '1', expect: 'bash' },
]

describe('resolveWindowsShellKind 行为（执行层事实来源）', () => {
  for (const c of CASES) {
    it(c.name, () => {
      if (process.platform !== 'win32') return
      const orig = {
        ccs: process.env.CLAUDE_CODE_SHELL,
        wb: process.env.CLAUDE_CODE_SHELL_WANT_BASH,
      }
      try {
        if (c.ccs === undefined) delete process.env.CLAUDE_CODE_SHELL
        else process.env.CLAUDE_CODE_SHELL = c.ccs
        if (c.wb === undefined) delete process.env.CLAUDE_CODE_SHELL_WANT_BASH
        else process.env.CLAUDE_CODE_SHELL_WANT_BASH = c.wb
        expect(resolveWindowsShellKind()).toBe(c.expect)
      } finally {
        if (orig.ccs === undefined) delete process.env.CLAUDE_CODE_SHELL
        else process.env.CLAUDE_CODE_SHELL = orig.ccs
        if (orig.wb === undefined) delete process.env.CLAUDE_CODE_SHELL_WANT_BASH
        else process.env.CLAUDE_CODE_SHELL_WANT_BASH = orig.wb
      }
    })
  }
})

describe('提示词模块均已接入统一判定（源码级约束）', () => {
  const PROMPT_FILES = [
    'src/tools/BashTool/prompt.ts',
    'src/context.ts',
    'src/constants/prompts.ts',
  ]

  it('三个提示词模块都调用 resolveWindowsShellKind', () => {
    for (const f of PROMPT_FILES) {
      expect(read(f), f).toContain('resolveWindowsShellKind')
    }
  })

  it('不残留旧的「声明即判定」逻辑（未声明时误判为 Git Bash 的根因）', () => {
    for (const f of PROMPT_FILES) {
      // 旧写法：includes('cmd') || ...includes('powershell') 直接从环境变量推导方向
      expect(read(f), f).not.toMatch(
        /includes\('cmd'\)[\s\S]{0,40}includes\('powershell'\)/,
      )
    }
  })

  it('BashTool/prompt.ts 的 Git Bash 分支受 resolvedKind 控制', () => {
    const src = read('src/tools/BashTool/prompt.ts')
    // 必须用统一判定结果决定展示分支，而非原始 shim
    expect(src).toMatch(/isNativeWinShell\s*=\s*resolvedKind\s*!==\s*'bash'/)
  })

  it('constants/prompts.ts 的 shell info 按 resolvedKind 分支', () => {
    const src = read('src/constants/prompts.ts')
    expect(src).toMatch(/resolvedKind\s*===\s*'bash'/)
    expect(src).toMatch(/resolvedKind\s*!==\s*'bash'/)
  })
})
