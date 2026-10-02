import { describe, it, expect } from 'vitest'
import {
  normalizeUnixCommandForWindows,
  fixModelCommandMistakes,
} from '../../src/tools/BashTool/BashTool.js'

// Windows 命令转换回归测试
// 覆盖曾导致以下报错的场景：
//   'pwd' is not recognized / 'ls' is not recognized
//   git: cannot change to '"D:/doge-code'

describe('normalizeUnixCommandForWindows（Unix → cmd.exe）', () => {
  it('转换单个 Unix 命令的首 token', () => {
    expect(normalizeUnixCommandForWindows('ls -la')).toBe('dir -la')
    expect(normalizeUnixCommandForWindows('pwd')).toBe('cd')
    expect(normalizeUnixCommandForWindows('cat file.txt')).toBe('type file.txt')
  })

  it('按 && 分段，转换每一段的首 token（回归：旧实现只转首 token）', () => {
    expect(normalizeUnixCommandForWindows('cd D:/x && pwd && ls src/')).toBe(
      'cd D:/x && cd && dir src/',
    )
  })

  it('按 | 分段', () => {
    expect(normalizeUnixCommandForWindows('grep -rn foo src | head -20')).toBe(
      'findstr -rn foo src | more -20',
    )
  })

  it('按 ; 分段', () => {
    expect(normalizeUnixCommandForWindows('echo done; pwd')).toBe(
      'echo done; cd',
    )
  })

  it('不转换已在映射表之外的命令', () => {
    expect(normalizeUnixCommandForWindows('git status')).toBe('git status')
  })

  it('跳过 env 变量赋值与注释行', () => {
    expect(normalizeUnixCommandForWindows('VAR=1 ls')).toBe('VAR=1 ls')
    expect(normalizeUnixCommandForWindows('# ls')).toBe('# ls')
  })
})

describe('fixModelCommandMistakes 路径引号（回归：git -C 误加引号）', () => {
  it('git -C 的路径引号必须闭合且不吞掉后续 token', () => {
    const out = fixModelCommandMistakes(
      'git -C D:/doge-code log --oneline -5',
      'win32',
    )
    // 旧 bug：产出 '"D:/doge-code'（未闭合）并吞掉 'log'
    expect(out).not.toContain('"D:/doge-code log"')
    expect(out).toContain('log --oneline')
  })

  it('带空格的真实路径仍被正确加引号', () => {
    const out = fixModelCommandMistakes('cat C:/Program Files/test.txt', 'win32')
    expect(out).toContain('"C:/Program Files/test.txt"')
  })

  it('反斜杠路径归一化为正斜杠', () => {
    const out = fixModelCommandMistakes('dir "D:\\doge-code" /b', 'win32')
    expect(out).toContain('D:/doge-code')
  })
})
